const fs = require('fs');

let chatbotSettings = null;
let getConfig = null;
let setConfig = null;
let getFilePath = null;
let sessionGiftCoins = null;
let userMusicCredits = null;
let emitMonetizedUsersUpdate = null;
let io = null;

let currentSpotifyTrack = { isPlaying: false };
let spotifyQueue = [];
let spotifyVoteSkips = new Set();

let lastTriggeredUri = null;
let lastPollUri = null;
let currentActiveQueueTrack = null;
let lastEmittedTrackUri = null;
let lastEmittedIsPlaying = null;

function levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function wordsMatchFuzzy(w1, w2) {
    if (w1 === w2) return true;
    if (w1.includes(w2) || w2.includes(w1)) return true;
    if (w1.length >= 3 && w2.length >= 3) {
        const distance = levenshtein(w1, w2);
        const maxAllowed = Math.min(2, Math.floor(Math.min(w1.length, w2.length) / 2));
        if (distance <= maxAllowed) return true;
    }
    return false;
}

function scoreTrack(track, query) {
    const cleanQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "");
    const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 0);
    
    const cleanTitle = track.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "");
    const titleWords = cleanTitle.split(/\s+/).filter(w => w.length > 0);
    
    const artists = track.artists.map(a => a.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, ""));
    const artistWords = artists.flatMap(a => a.split(/\s+/)).filter(w => w.length > 0);
    
    let matchedQueryWords = 0;
    for (const qw of queryWords) {
        let titleMatched = false;
        for (const tw of titleWords) {
            if (wordsMatchFuzzy(tw, qw)) {
                titleMatched = true;
                break;
            }
        }
        if (titleMatched || cleanTitle.includes(qw)) {
            matchedQueryWords += 2;
        } else {
            let artistMatched = false;
            for (const aw of artistWords) {
                if (wordsMatchFuzzy(aw, qw)) {
                    artistMatched = true;
                    break;
                }
            }
            if (artistMatched) {
                matchedQueryWords += 1;
            }
        }
    }
    
    if (cleanTitle.includes(cleanQuery)) {
        matchedQueryWords += 3;
    }
    
    return matchedQueryWords;
}

function stripEmojis(str) {
    if (!str) return '';
    return str.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim();
}

async function searchSpotify(query, type = 'track,artist', limit = 5) {
    const config = getConfig();
    if (!config.spotifyAccessToken) return null;
    
    if (Date.now() + 60000 >= config.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) return null;
    }
    
    try {
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${config.spotifyAccessToken}`
            }
        });
        
        if (!response.ok) {
            console.error('Spotify search failed:', response.status, await response.text());
            return null;
        }
        
        return await response.json();
    } catch (err) {
        console.error('Error searching Spotify:', err);
        return null;
    }
}

async function playSpotifyTrack(uri) {
    const config = getConfig();
    if (!config.spotifyAccessToken) return false;
    if (Date.now() + 60000 >= config.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) return false;
    }
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${config.spotifyAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uris: [uri] })
        });
        if (response.status === 204 || response.ok) {
            return true;
        }
        let errText = '';
        try {
            errText = await response.text();
        } catch (e) {}
        console.error('Spotify play failed:', response.status, errText);
        
        let customMessage = `Error de reproducción (${response.status}).`;
        if (response.status === 401) {
            customMessage = "Faltan permisos de control. Desvincula y vuelve a vincular Spotify.";
        } else if (response.status === 404 || errText.includes("NO_ACTIVE_DEVICE")) {
            customMessage = "No hay dispositivo activo. Abre Spotify en tu PC/móvil y reproduce cualquier canción para activarlo.";
        } else if (response.status === 403) {
            customMessage = "Acción prohibida. Asegúrate de que la cuenta vinculada tiene Spotify Premium.";
        }
        
        io.emit('system', { type: 'error', message: `Spotify: ${customMessage}` });
        return false;
    } catch (err) {
        console.error('Error playing Spotify track:', err);
        return false;
    }
}

async function setSpotifyVolume(volumePercent) {
    const config = getConfig();
    if (!config.spotifyAccessToken) return false;
    if (Date.now() + 60000 >= config.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) return false;
    }
    try {
        const response = await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${volumePercent}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${config.spotifyAccessToken}`
            }
        });
        if (response.status === 204 || response.ok) {
            return true;
        }
        console.error('Spotify volume change failed:', response.status, await response.text());
        return false;
    } catch (err) {
        console.error('Error setting Spotify volume:', err);
        return false;
    }
}

async function pauseSpotify() {
    const config = getConfig();
    if (!config.spotifyAccessToken) return false;
    if (Date.now() + 60000 >= config.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) return false;
    }
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${config.spotifyAccessToken}`
            }
        });
        return response.ok;
    } catch (err) {
        console.error('Error pausing Spotify:', err);
        return false;
    }
}

async function resumeSpotify() {
    const config = getConfig();
    if (!config.spotifyAccessToken) return false;
    if (Date.now() + 60000 >= config.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) return false;
    }
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${config.spotifyAccessToken}`
            }
        });
        return response.ok;
    } catch (err) {
        console.error('Error resuming Spotify:', err);
        return false;
    }
}

async function previousSpotifyTrack() {
    const config = getConfig();
    if (!config.spotifyAccessToken) return false;
    if (Date.now() + 60000 >= config.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) return false;
    }
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/previous', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.spotifyAccessToken}`
            }
        });
        return response.ok;
    } catch (err) {
        console.error('Error skipping to previous Spotify track:', err);
        return false;
    }
}

async function playNextInQueue() {
    const config = getConfig();
    if (spotifyQueue.length === 0) {
        try {
            const response = await fetch('https://api.spotify.com/v1/me/player/next', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.spotifyAccessToken}`
                }
            });
            currentActiveQueueTrack = null;
            if (response.ok) {
                await resumeSpotify();
            }
            return response.ok;
        } catch (e) {
            console.error('Error skipping to next native song:', e);
            return false;
        }
    }
    
    const nextTrack = spotifyQueue.shift();
    io.emit('spotify_queue_updated', spotifyQueue);
    emitMonetizedUsersUpdate(true);
    
    spotifyVoteSkips.clear();
    io.emit('spotify_votes_updated', { votes: 0, limit: config.spotifyVoteSkipLimit });
    
    console.info(`Reproduciendo siguiente en cola: ${nextTrack.title} por ${nextTrack.artist} (Pedido por @${nextTrack.requester})`);
    
    currentActiveQueueTrack = nextTrack;
    const success = await playSpotifyTrack(nextTrack.uri);
    
    setTimeout(async () => {
        const track = await getSpotifyCurrentlyPlaying();
        if (track) {
            currentSpotifyTrack = track;
            if (currentActiveQueueTrack && (track.title === currentActiveQueueTrack.title || track.spotifyUrl === currentActiveQueueTrack.uri)) {
                track.requester = currentActiveQueueTrack.requester;
            }
            io.emit('spotify_track', track);
        }
    }, 1000);
    
    return success;
}

function addTrackToQueue(track) {
    const config = getConfig();
    spotifyQueue.push(track);
    io.emit('spotify_queue_updated', spotifyQueue);
    emitMonetizedUsersUpdate(true);
    console.info(`Agregado a la cola: ${track.title} - ${track.artist} (Pedido por @${track.requester})`);
    
    if (spotifyQueue.length === 1 && (!currentSpotifyTrack || !currentSpotifyTrack.isPlaying)) {
        playNextInQueue();
    }
}

function handleVoteSkip(requester, isStaff) {
    const config = getConfig();
    if (!currentSpotifyTrack || !currentSpotifyTrack.isPlaying) {
        return;
    }
    
    if (spotifyVoteSkips.has(requester)) {
        io.emit('system', { type: 'warning', message: `@${requester} ya votó para omitir esta canción.` });
        return;
    }
    
    spotifyVoteSkips.add(requester);
    const votesNeeded = config.spotifyVoteSkipLimit || 3;
    const currentVotes = spotifyVoteSkips.size;
    
    io.emit('spotify_votes_updated', { votes: currentVotes, limit: votesNeeded });
    io.emit('system', { type: 'info', message: `@${requester} votó para omitir la canción. (${currentVotes}/${votesNeeded})` });
    
    if (currentVotes >= votesNeeded) {
        console.log(`Límite de votos alcanzado (${currentVotes}/${votesNeeded}). Omitiendo canción...`);
        io.emit('system', { type: 'info', message: `🎵 Límite de votos alcanzado. Omitiendo canción...` });
        playNextInQueue();
    }
}

async function handleSongRequest(query, requester) {
    const config = getConfig();
    if (!config.spotifyAccessToken) return;
    
    console.log(`Procesando solicitud de canción: "${query}" por @${requester}`);
    
    let artistTrack = null;
    try {
        const artistSearch = await searchSpotify(query, 'artist', 5);
        let matchedArtist = null;
        if (artistSearch && artistSearch.artists && artistSearch.artists.items.length > 0) {
            matchedArtist = artistSearch.artists.items.find(
                artist => artist.name.toLowerCase() === query.toLowerCase().trim()
            );
        }
        
        if (matchedArtist) {
            console.log(`Artista coincidente exacto encontrado: "${matchedArtist.name}". Buscando canciones con filtro artist:...`);
            const searchTracks = await searchSpotify(`artist:"${matchedArtist.name}"`, 'track', 5);
            if (searchTracks && searchTracks.tracks && searchTracks.tracks.items.length > 0) {
                const tracks = searchTracks.tracks.items;
                let allowedTracks = tracks;
                if (!config.spotifyExplicitAllowed) {
                    allowedTracks = tracks.filter(t => !t.explicit);
                }
                
                if (allowedTracks.length > 0) {
                    const randomIndex = Math.floor(Math.random() * allowedTracks.length);
                    artistTrack = allowedTracks[randomIndex];
                    console.log(`Pista de artista aleatoria elegida: "${artistTrack.name}"`);
                } else {
                    io.emit('system', { type: 'warning', message: `Todas las canciones encontradas de ${matchedArtist.name} son explícitas y están bloqueadas.` });
                    return;
                }
            }
        }
    } catch (e) {
        console.error('Error in artist smart search:', e);
    }
    
    let chosenTrack = artistTrack;
    
    if (!chosenTrack) {
        try {
            const cleanQuery = query.replace(/[-+]/g, ' ').trim();
            console.log(`Buscando pistas para query limpio: "${cleanQuery}"`);
            const trackSearch = await searchSpotify(cleanQuery, 'track', 5);
            if (trackSearch && trackSearch.tracks && trackSearch.tracks.items.length > 0) {
                const tracks = trackSearch.tracks.items;
                let allowedTracks = tracks;
                if (!config.spotifyExplicitAllowed) {
                    allowedTracks = tracks.filter(t => !t.explicit);
                }
                
                if (allowedTracks.length > 0) {
                    const tracksWithScores = allowedTracks.map(track => ({
                        track,
                        score: scoreTrack(track, cleanQuery)
                    }));
                    
                    tracksWithScores.sort((a, b) => {
                        if (b.score !== a.score) {
                            return b.score - a.score;
                        }
                        return (b.track.popularity || 0) - (a.track.popularity || 0);
                    });
                    
                    chosenTrack = tracksWithScores[0].track;
                    console.log(`Mejor pista coincidente elegida: "${chosenTrack.name}" por "${chosenTrack.artists.map(a => a.name).join(', ')}" (Score: ${tracksWithScores[0].score}, Pop: ${chosenTrack.popularity})`);
                }
            }
        } catch (e) {
            console.error('Error in track search:', e);
        }
    }
    
    if (!chosenTrack) {
        io.emit('system', { type: 'warning', message: `No se encontraron canciones para "${query}".` });
        return;
    }
    
    if (!config.spotifyExplicitAllowed && chosenTrack.explicit) {
        console.log(`Canción explícita bloqueada: "${chosenTrack.name}" por "${chosenTrack.artists.map(a => a.name).join(', ')}"`);
        io.emit('system', { type: 'warning', message: `La canción "${chosenTrack.name}" contiene contenido explícito y fue bloqueada.` });
        return;
    }
    
    const trackItem = {
        id: chosenTrack.id,
        title: chosenTrack.name,
        artist: chosenTrack.artists.map(a => a.name).join(', '),
        albumArt: (chosenTrack.album.images && chosenTrack.album.images.length > 0) ? chosenTrack.album.images[0].url : '',
        uri: chosenTrack.uri,
        requester: requester,
        durationMs: chosenTrack.duration_ms
    };
    
    addTrackToQueue(trackItem);
    io.emit('system', { type: 'success', message: `@${requester} añadió a la cola: "${trackItem.title}" - ${trackItem.artist}` });
}

function sendCurrentTrackToChatInfo() {
    if (currentSpotifyTrack && currentSpotifyTrack.isPlaying) {
        io.emit('system', { 
            type: 'info', 
            message: `Canción actual: "${currentSpotifyTrack.title}" por ${currentSpotifyTrack.artist}` 
        });
    } else {
        io.emit('system', { 
            type: 'info', 
            message: `No hay ninguna canción reproduciéndose.` 
        });
    }
}

function sendQueueToChatInfo() {
    if (spotifyQueue.length === 0) {
        io.emit('system', { type: 'info', message: `La cola de música está vacía.` });
        return;
    }
    const nextSongs = spotifyQueue.slice(0, 3).map((s, idx) => `${idx + 1}. "${s.title}" (@${s.requester})`).join(', ');
    io.emit('system', { 
        type: 'info', 
        message: `Cola actual (total ${spotifyQueue.length}): ${nextSongs}${spotifyQueue.length > 3 ? '...' : ''}` 
    });
}

function sendVoteStatusToChatInfo() {
    const config = getConfig();
    const votesNeeded = config.spotifyVoteSkipLimit || 3;
    const currentVotes = spotifyVoteSkips.size;
    io.emit('system', { 
        type: 'info', 
        message: `Votos para omitir: ${currentVotes}/${votesNeeded}` 
    });
}

async function refreshSpotifyToken() {
    const config = getConfig();
    console.log('Refrescando token de Spotify...');
    const clientId = config.spotifyClientId || '28b2a2ea9ff34b989b9b13fc7979691f';
    const clientSecret = config.spotifyClientSecret || 'b2e0324ac37f4a6abef68319d285fda2';
    
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: config.spotifyRefreshToken
            })
        });
        
        const tokenData = await response.json();
        if (!response.ok || tokenData.error) {
            console.error('Spotify token refresh failed:', tokenData);
            return false;
        }
        
        config.spotifyAccessToken = tokenData.access_token;
        if (tokenData.refresh_token) {
            config.spotifyRefreshToken = tokenData.refresh_token;
        }
        config.spotifyExpiresAt = Date.now() + (tokenData.expires_in * 1000);
        
        setConfig(config);
        const filePath = getFilePath();
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
        io.emit('chatbot_settings_updated', config);
        
        console.log('Token de Spotify refrescado exitosamente.');
        return true;
    } catch (err) {
        console.error('Error refreshing Spotify token:', err);
        return false;
    }
}

async function getSpotifyCurrentlyPlaying() {
    const config = getConfig();
    if (!config.spotifyAccessToken) return { isPlaying: false };
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: {
                'Authorization': `Bearer ${config.spotifyAccessToken}`
            }
        });
        
        if (response.status === 204) {
            return { isPlaying: false };
        }
        
        if (response.status === 401) {
            if (Date.now() + 60000 >= config.spotifyExpiresAt) {
                const success = await refreshSpotifyToken();
                if (success) {
                    return getSpotifyCurrentlyPlaying();
                }
            }
            const errText = await response.text();
            console.error('Spotify API error status:', response.status, errText);
            return { isPlaying: false };
        }
        
        if (!response.ok) {
            const errText = await response.text();
            console.error('Spotify API error status:', response.status, errText);
            return { isPlaying: false };
        }
        
        const data = await response.json();
        if (!data || !data.item) {
            return { isPlaying: false };
        }
        
        return {
            isPlaying: data.is_playing,
            title: data.item.name,
            artist: data.item.artists.map(a => a.name).join(', '),
            albumArt: (data.item.album.images && data.item.album.images.length > 0) ? data.item.album.images[0].url : '',
            progressMs: data.progress_ms,
            durationMs: data.item.duration_ms,
            spotifyUrl: data.item.external_urls.spotify
        };
    } catch (err) {
        console.error('Error fetching currently playing from Spotify:', err);
        return { isPlaying: false };
    }
}

async function handleSpotifyChatCommand(data) {
    const config = getConfig();
    if (!config.spotifyConnected || !config.spotifyEnabled || !config.spotifyChatQueueEnabled) {
        return;
    }

    const comment = (data.comment || '').trim();
    const uniqueId = data.uniqueId;
    const nickname = data.nickname || uniqueId;
    
    const isAnchor = (data.userIdentity && typeof data.userIdentity.isAnchor !== 'undefined')
        ? data.userIdentity.isAnchor
        : (uniqueId && config.tiktokUsername && uniqueId.toLowerCase() === config.tiktokUsername.toLowerCase());
        
    const isModerator = isAnchor || ((data.userIdentity && typeof data.userIdentity.isModeratorOfAnchor !== 'undefined')
        ? data.userIdentity.isModeratorOfAnchor
        : !!data.isModerator);
        
    const isSubscriber = isAnchor || ((data.userIdentity && typeof data.userIdentity.isSubscriberOfAnchor !== 'undefined')
        ? data.userIdentity.isSubscriberOfAnchor
        : !!data.isSubscriber);
    
    const prefix = (config.spotifyCommandPrefix || '!song').trim().toLowerCase();
    const lowerComment = comment.toLowerCase();
    
    let isRequestCommand = false;
    let query = '';
    
    if (lowerComment.startsWith(prefix)) {
        isRequestCommand = true;
        query = comment.substring(prefix.length).trim();
    } else if (lowerComment.startsWith('!cancion ') || lowerComment.startsWith('!song ')) {
        isRequestCommand = true;
        const spaceIdx = comment.indexOf(' ');
        query = spaceIdx !== -1 ? comment.substring(spaceIdx + 1).trim() : '';
    }
    
    if (isRequestCommand) {
        if (query.length > 0) {
            // 1. Jerarquía de Rol
            const requiredRole = (config.spotifyPermission || config.spotifyAllowedRole || config.spotifyUserRole || 'all').toLowerCase().trim();
            let hasRolePermission = false;

            if (isAnchor || isModerator) {
                hasRolePermission = true;
            } else if (requiredRole === 'all' || requiredRole === 'todos') {
                hasRolePermission = true;
            } else if ((requiredRole === 'followers' || requiredRole === 'seguidores') && (data.isFollower || (data.followRole && data.followRole > 0))) {
                hasRolePermission = true;
            } else if ((requiredRole === 'subscribers' || requiredRole === 'subs') && isSubscriber) {
                hasRolePermission = true;
            }

            if (!hasRolePermission) {
                io.emit('system', {
                    type: 'warning',
                    message: `@${uniqueId} no cumple el rol requerido (${requiredRole}) para pedir canciones.`
                });
                return;
            }

            // 2. Jerarquía de Monetización
            // Si cualquiera de los flags viene explícitamente en false, la monetización se desactiva
            let isMonetizationActive = false;
            if (config.spotifyMonetizationEnabled !== undefined) {
                isMonetizationActive = config.spotifyMonetizationEnabled === true || config.spotifyMonetizationEnabled === 'true';
            } else if (config.spotifyPaidOnly !== undefined) {
                isMonetizationActive = config.spotifyPaidOnly === true || config.spotifyPaidOnly === 'true';
            }

            console.log(`[Spotify Command] Usuario: @${uniqueId} | Monetización: ${isMonetizationActive} | MinCoins: ${config.spotifyMinCoins} | Rol Requerido: ${requiredRole}`);

            if (isMonetizationActive && !isAnchor && !isModerator) {
                const minCoins = parseInt(config.spotifyMinCoins, 10) || 1;
                const userCoins = (sessionGiftCoins && sessionGiftCoins[uniqueId.toLowerCase()]) || 0;
                const userCredits = (userMusicCredits && userMusicCredits[uniqueId.toLowerCase()]) || 0;

                if (userCoins < minCoins && userCredits < 1) {
                    io.emit('system', {
                        type: 'warning',
                        message: `@${uniqueId} requiere enviar un regalo de al menos ${minCoins} monedas para pedir canción.`
                    });
                    return;
                }

                if (userCoins >= minCoins) {
                    sessionGiftCoins[uniqueId.toLowerCase()] -= minCoins;
                } else if (userCredits >= 1) {
                    userMusicCredits[uniqueId.toLowerCase()] -= 1;
                }
                if (typeof emitMonetizedUsersUpdate === 'function') emitMonetizedUsersUpdate();
            }

            await handleSongRequest(query, uniqueId);
        } else {
            sendCurrentTrackToChatInfo();
        }
    } else if (lowerComment === '!current' || lowerComment === '!cancion') {
        sendCurrentTrackToChatInfo();
    } else if (lowerComment === '!queue' || lowerComment === '!cola') {
        sendQueueToChatInfo();
    } else if (lowerComment === '!skip' || lowerComment === '!omitir') {
        handleVoteSkip(uniqueId, isModerator || isAnchor);
    } else if (lowerComment === '!votos') {
        sendVoteStatusToChatInfo();
    } else if (lowerComment === '!skipsong' || lowerComment === '!skipforce') {
        const allowedUsers = (config.spotifySkipAllowedUsers || '')
            .split(',')
            .map(u => u.trim().toLowerCase())
            .filter(Boolean);
        const isAllowedUser = allowedUsers.includes(uniqueId.toLowerCase());
        
        if (isModerator || isAnchor || isAllowedUser) {
            console.log(`Force skip por @${uniqueId}`);
            io.emit('system', { type: 'info', message: `@${uniqueId} omitió la canción.` });
            playNextInQueue();
        }
    } else if (lowerComment === '!clearqueue' || lowerComment === '!limpiarcola') {
        if (isModerator || isAnchor) {
            console.log(`Cola vaciada por @${uniqueId}`);
            spotifyQueue = [];
            io.emit('spotify_queue_updated', spotifyQueue);
            emitMonetizedUsersUpdate(true);
            io.emit('system', { type: 'info', message: `@${uniqueId} vació la cola.` });
        }
    }
}

function getSpotifyQueue() {
    return spotifyQueue;
}

function init(app, ioInstance, options) {
    io = ioInstance;
    getConfig = options.getConfig;
    setConfig = options.setConfig;
    getFilePath = options.getFilePath;
    sessionGiftCoins = options.sessionGiftCoins;
    userMusicCredits = options.userMusicCredits;
    emitMonetizedUsersUpdate = options.emitMonetizedUsersUpdate;

    // 1. Endpoints Express para OAuth
    app.get('/spotify-login', (req, res) => {
        const config = getConfig();
        const clientId = config.spotifyClientId || '28b2a2ea9ff34b989b9b13fc7979691f';
        const redirectUri = 'http://127.0.0.1:3000/spotify-callback';
        const scopes = 'user-read-currently-playing user-read-playback-state user-read-private user-modify-playback-state';
        const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
        res.redirect(authUrl);
    });

    app.get('/spotify-callback', async (req, res) => {
        const code = req.query.code;
        if (!code) {
            return res.redirect('/?spotify=error&message=no_code');
        }
        
        const config = getConfig();
        const clientId = config.spotifyClientId || '28b2a2ea9ff34b989b9b13fc7979691f';
        const clientSecret = config.spotifyClientSecret || 'b2e0324ac37f4a6abef68319d285fda2';
        const redirectUri = 'http://127.0.0.1:3000/spotify-callback';
        
        try {
            const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri
                })
            });
            
            const tokenData = await tokenResponse.json();
            if (!tokenResponse.ok || tokenData.error) {
                console.error('Spotify token exchange failed:', tokenData);
                return res.redirect('/?spotify=error&message=' + encodeURIComponent(tokenData.error_description || 'token_exchange_failed'));
            }
            
            const profileResponse = await fetch('https://api.spotify.com/v1/me', {
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`
                }
            });
            
            const profileData = await profileResponse.json();
            const userName = profileData.display_name || profileData.id || 'Usuario Spotify';
            const profilePic = (profileData.images && profileData.images.length > 0) ? profileData.images[0].url : '';
            
            config.spotifyAccessToken = tokenData.access_token;
            config.spotifyRefreshToken = tokenData.refresh_token;
            config.spotifyExpiresAt = Date.now() + (tokenData.expires_in * 1000);
            config.spotifyUserName = userName;
            config.spotifyUserProfilePic = profilePic;
            config.spotifyUserCountry = profileData.country || 'US';
            config.spotifyConnected = true;
            config.spotifyEnabled = true;
            
            setConfig(config);
            const filePath = getFilePath();
            fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
            io.emit('chatbot_settings_updated', config);
            
            res.redirect('/?spotify=connected');
        } catch (err) {
            console.error('Error in Spotify Callback:', err);
            res.redirect('/?spotify=error&message=' + encodeURIComponent(err.message));
        }
    });

    // 2. Socket.io Listeners
    io.on('connection', (socket) => {
        socket.on('disconnect_spotify', () => {
            console.log('Desvinculando Spotify...');
            const config = getConfig();
            config.spotifyAccessToken = '';
            config.spotifyRefreshToken = '';
            config.spotifyExpiresAt = 0;
            config.spotifyUserName = '';
            config.spotifyUserProfilePic = '';
            config.spotifyConnected = false;
            config.spotifyEnabled = false;
            try {
                setConfig(config);
                const filePath = getFilePath();
                fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
                io.emit('chatbot_settings_updated', config);
            } catch (err) {
                console.error('Error saving settings after Spotify disconnect:', err);
            }
        });

        socket.on('get_spotify_queue', () => {
            socket.emit('spotify_queue_updated', spotifyQueue);
        });
        
        socket.on('delete_queue_item', (index) => {
            if (index >= 0 && index < spotifyQueue.length) {
                const removed = spotifyQueue.splice(index, 1);
                io.emit('spotify_queue_updated', spotifyQueue);
                console.info(`Eliminado de la cola por el anfitrión: ${removed[0].title}`);
            }
        });
        
        socket.on('play_queue_item', async (index) => {
            if (index >= 0 && index < spotifyQueue.length) {
                const track = spotifyQueue.splice(index, 1)[0];
                io.emit('spotify_queue_updated', spotifyQueue);
                
                spotifyVoteSkips.clear();
                const config = getConfig();
                io.emit('spotify_votes_updated', { votes: 0, limit: config.spotifyVoteSkipLimit });
                
                currentActiveQueueTrack = track;
                await playSpotifyTrack(track.uri);
                setTimeout(async () => {
                    const trackData = await getSpotifyCurrentlyPlaying();
                    if (trackData) {
                        currentSpotifyTrack = trackData;
                        if (currentActiveQueueTrack && (trackData.title === currentActiveQueueTrack.title || trackData.spotifyUrl === currentActiveQueueTrack.uri)) {
                            trackData.requester = currentActiveQueueTrack.requester;
                        }
                        io.emit('spotify_track', trackData);
                    }
                }, 1000);
            }
        });
        
        socket.on('skip_spotify_track', () => {
            console.info('Skip manual solicitado desde el panel.');
            playNextInQueue();
        });
        
        socket.on('clear_spotify_queue', () => {
            console.info('Cola vaciada desde el panel.');
            spotifyQueue = [];
            io.emit('spotify_queue_updated', spotifyQueue);
        });

        socket.on('clear_monetized_users', () => {
            console.info('Limpieza de usuarios monetizados y créditos solicitada desde el panel.');
            for (const key in sessionGiftCoins) delete sessionGiftCoins[key];
            for (const key in userMusicCredits) delete userMusicCredits[key];
            emitMonetizedUsersUpdate(true);
        });

        socket.on('spotify_toggle_play', async () => {
            console.info('Play/Pause solicitado desde el panel.');
            if (currentSpotifyTrack && currentSpotifyTrack.isPlaying) {
                await pauseSpotify();
            } else {
                await resumeSpotify();
            }
            setTimeout(async () => {
                const trackData = await getSpotifyCurrentlyPlaying();
                if (trackData) {
                    currentSpotifyTrack = trackData;
                    if (currentActiveQueueTrack && (trackData.title === currentActiveQueueTrack.title || trackData.spotifyUrl === currentActiveQueueTrack.uri)) {
                        trackData.requester = currentActiveQueueTrack.requester;
                    }
                    io.emit('spotify_track', trackData);
                }
            }, 600);
        });

        socket.on('spotify_prev', async () => {
            console.info('Anterior track solicitado desde el panel.');
            await previousSpotifyTrack();
            setTimeout(async () => {
                const trackData = await getSpotifyCurrentlyPlaying();
                if (trackData) {
                    currentSpotifyTrack = trackData;
                    if (currentActiveQueueTrack && (trackData.title === currentActiveQueueTrack.title || trackData.spotifyUrl === currentActiveQueueTrack.uri)) {
                        trackData.requester = currentActiveQueueTrack.requester;
                    }
                    io.emit('spotify_track', trackData);
                }
            }, 600);
        });
    });

    // 3. Background Polling Interval (cada 3 segundos)
    setInterval(async () => {
        const config = getConfig();
        if (config.spotifyConnected && config.spotifyEnabled) {
            try {
                const track = await getSpotifyCurrentlyPlaying();
                if (track) {
                    if (track.spotifyUrl !== lastPollUri) {
                        lastTriggeredUri = null;
                        lastPollUri = track.spotifyUrl;
                        spotifyVoteSkips.clear();
                        io.emit('spotify_votes_updated', { votes: 0, limit: config.spotifyVoteSkipLimit });
                    }

                    if (track.isPlaying && track.durationMs && track.progressMs !== undefined) {
                        const remainingTime = track.durationMs - track.progressMs;
                        if (remainingTime <= 5000 && track.spotifyUrl !== lastTriggeredUri) {
                            console.log(`Finalización de track detectada (Restan: ${remainingTime}ms). Reproduciendo siguiente en cola...`);
                            lastTriggeredUri = track.spotifyUrl;
                            playNextInQueue();
                        }
                    }

                    currentSpotifyTrack = track;
                    
                    if (currentActiveQueueTrack && (track.title === currentActiveQueueTrack.title || track.spotifyUrl === currentActiveQueueTrack.uri)) {
                        track.requester = currentActiveQueueTrack.requester;
                    } else if (currentActiveQueueTrack && track.spotifyUrl !== currentActiveQueueTrack.uri) {
                        currentActiveQueueTrack = null;
                    }
                    
                    const hasTrackChanged = track.spotifyUrl !== lastEmittedTrackUri;
                    const hasStatusChanged = track.isPlaying !== lastEmittedIsPlaying;

                    if (hasTrackChanged || hasStatusChanged) {
                        lastEmittedTrackUri = track.spotifyUrl;
                        lastEmittedIsPlaying = track.isPlaying;
                        io.emit('spotify_track', track);
                    }
                }
            } catch (e) {
                console.error('Error in Spotify background polling interval:', e);
            }
        }
    }, 3000);
}

function updateConfig(newConfig) {
    if (newConfig) {
        setConfig(newConfig);
    }
}

module.exports = {
    init,
    updateConfig,
    handleSpotifyChatCommand,
    setVolume: setSpotifyVolume,
    getSpotifyQueue: () => spotifyQueue,
    getSpotifyVoteSkipsCount: () => spotifyVoteSkips.size
};
