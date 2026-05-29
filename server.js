const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');
const fs = require('fs');
const { EdgeTTS } = require('node-edge-tts');
const os = require('os');
const packageJson = require('./package.json');

const writableDir = process.env.USER_DATA_PATH || __dirname;
const SETTINGS_FILE = path.join(writableDir, 'chatbot_settings.json');

// Ensure writable directories exist
if (process.env.USER_DATA_PATH && !fs.existsSync(writableDir)) {
    fs.mkdirSync(writableDir, { recursive: true });
}

let chatbotSettings = {
    active: false,
    permission: "all",
    readUsername: true,
    readPrefixRequired: false,
    prefixes: [".", "/"],
    voiceName: "",
    ttsEngine: "cloud",
    cloudVoiceName: "es-CO-SalomeNeural",
    volume: 1.0,
    pitch: 1.0,
    rate: 1.0,
    playLocation: "overlay",
    maxCharacters: 150,
    ignoreUserList: [],
    bannedWords: [],
    bannedWordsAction: "skip",
    blockRareLanguages: true,
    userVoices: [],
    // New settings
    tiktokUsername: "",
    autoConnect: true,
    spotifyClientId: "",
    spotifyClientSecret: "",
    spotifyEnabled: false,
    spotifyTheme: "apple-music",
    spotifyPosition: "bottom-left",
    spotifyAccessToken: "",
    spotifyRefreshToken: "",
    spotifyExpiresAt: 0,
    spotifyUserName: "",
    spotifyUserProfilePic: "",
    spotifyConnected: false,
    spotifyChatQueueEnabled: true,
    spotifyExplicitAllowed: false,
    spotifyVolume: 80,
    spotifyPermission: "all",
    spotifyCommandPrefix: "!song",
    spotifyVoteSkipLimit: 3,
    spotifyNeonColor: "pink",
    spotifyVinylSpeed: "normal",
    spotifyVinylDesign: "classic",
    themeName: "neutral",
    exclusiveTtsEnabled: false,
    exclusiveTtsUser: "",
    // Event TTS settings
    readFollowsEnabled: false,
    readSharesEnabled: false,
    readGiftsEnabled: false,
    readLikesMilestoneEnabled: false,
    likesMilestoneValue: 100
};

// Global in-memory rankings database for active stream session
let rankings = {
    likes: {},  // { username: { nickname, count } }
    gifts: {},  // { username: { nickname, count } }
    mvp: {}     // { username: { nickname, count } }
};


// Helper to get local IP addresses
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const k in interfaces) {
        for (const k2 in interfaces[k]) {
            const address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    return addresses;
}

try {
    if (fs.existsSync(SETTINGS_FILE)) {
        chatbotSettings = { ...chatbotSettings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) };
    } else {
        // If it doesn't exist in writable folder, try to copy it from packaged app directory
        const templateFile = path.join(__dirname, 'chatbot_settings.json');
        if (fs.existsSync(templateFile) && templateFile !== SETTINGS_FILE) {
            fs.copyFileSync(templateFile, SETTINGS_FILE);
            chatbotSettings = { ...chatbotSettings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) };
        } else {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
        }
    }
    
    // Auto-detect theme based on loaded username
    if (chatbotSettings.tiktokUsername) {
        const usernameLower = chatbotSettings.tiktokUsername.toLowerCase();
        if (usernameLower.includes('majo')) {
            chatbotSettings.themeName = 'majo';
        } else if (usernameLower.includes('naya')) {
            chatbotSettings.themeName = 'naya';
        } else {
            chatbotSettings.themeName = 'neutral';
        }
    } else {
        chatbotSettings.themeName = 'neutral';
    }
} catch (err) {
    console.error('Error loading chatbot settings:', err);
}

// Helper to generate cloud TTS audio
async function handleCloudTTS(data) {
    if (!chatbotSettings) return;
    if (chatbotSettings.ttsEngine !== 'cloud') return;
    
    const uniqueId = (data.uniqueId || '').toLowerCase();
    const isExclusiveUser = chatbotSettings.exclusiveTtsEnabled && 
                            chatbotSettings.exclusiveTtsUser && 
                            uniqueId === chatbotSettings.exclusiveTtsUser.toLowerCase().trim();

    // If chatbot is inactive, ONLY allow exclusive user (if enabled)
    if (!chatbotSettings.active) {
        if (!isExclusiveUser) return;
    }

    // If exclusive user mode is enabled, ONLY read from this user
    if (chatbotSettings.exclusiveTtsEnabled) {
        if (!isExclusiveUser) return;
    }
    
    const nickname = data.nickname || data.uniqueId || 'Usuario';
    let comment = data.comment || '';
    
    // 1. Blacklist check
    const blacklist = (chatbotSettings.ignoreUserList || []).map(u => u.toLowerCase().trim());
    if (blacklist.includes(uniqueId)) return;
    
    // 2. Permission check
    const userRole = chatbotSettings.permission || 'all';
    const isSubscriber = data.isSubscriber || (data.userIdentity && data.userIdentity.isSubscriberOfAnchor);
    const isModerator = data.isModerator || (data.userIdentity && data.userIdentity.isModeratorOfAnchor);
    const isAnchor = data.isAnchor || (data.userIdentity && data.userIdentity.isAnchor);
    
    if (userRole === 'mods' && !isModerator && !isAnchor) return;
    if (userRole === 'subs' && !isSubscriber && !isModerator && !isAnchor) return;
    
    // 3. Prefix command check
    if (chatbotSettings.readPrefixRequired) {
        const prefixes = chatbotSettings.prefixes || ['.', '/'];
        const hasPrefix = prefixes.some(p => comment.trim().startsWith(p));
        if (!hasPrefix) return;
        
        for (const p of prefixes) {
            if (comment.trim().startsWith(p)) {
                comment = comment.trim().substring(p.length).trim();
                break;
            }
        }
    }
    
    // 4. Character filtering (block rare languages)
    if (chatbotSettings.blockRareLanguages) {
        const disallowedRegex = /[\u0900-\u097F\u0600-\u06FF\u0400-\u04FF\u4e00-\u9fa5]/;
        if (disallowedRegex.test(comment)) return;
    }
    
    // 5. Clean emojis
    comment = comment.replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/gu, '');
    
    if (!comment.trim()) return;
    
    // 6. Custom Blocked Words check
    const banned = (chatbotSettings.bannedWords || []).map(w => w.toLowerCase().trim()).filter(w => w.length > 0);
    for (const word of banned) {
        if (comment.toLowerCase().includes(word)) {
            if (chatbotSettings.bannedWordsAction === 'skip') {
                return;
            } else {
                const censorRegex = new RegExp(word, 'gi');
                comment = comment.replace(censorRegex, '***');
            }
        }
    }
    
    // 7. Limit length
    const maxChars = parseInt(chatbotSettings.maxCharacters ?? 150);
    if (comment.length > maxChars) {
        comment = comment.substring(0, maxChars) + '...';
    }
    
    // 8. Username reading format
    let textToSpeak = comment;
    if (chatbotSettings.readUsername) {
        textToSpeak = `${nickname} dice: ${comment}`;
    }
    
    // 9. Determine voice settings
    const userVoiceRule = (chatbotSettings.userVoices || []).find(v => v.username.toLowerCase() === uniqueId);
    let voiceName = chatbotSettings.cloudVoiceName || 'es-CO-SalomeNeural';
    let volume = chatbotSettings.volume ?? 1;
    let pitch = chatbotSettings.pitch ?? 1;
    let rate = chatbotSettings.rate ?? 1;
    
    if (userVoiceRule) {
        voiceName = userVoiceRule.voice;
        volume = userVoiceRule.volume ?? 1;
        pitch = userVoiceRule.pitch ?? 1;
        rate = userVoiceRule.rate ?? 1;
    }
    
    const tempFile = path.join(writableDir, `temp_tts_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp3`);
    
    // Rate formatting
    const ratePercentage = Math.round((rate - 1) * 100);
    const rateStr = ratePercentage >= 0 ? `+${ratePercentage}%` : `${ratePercentage}%`;
    
    // Pitch formatting
    const pitchPercentage = Math.round((pitch - 1) * 50);
    const pitchStr = pitchPercentage >= 0 ? `+${pitchPercentage}Hz` : `${pitchPercentage}Hz`;
    
    try {
        const tts = new EdgeTTS({
            voice: voiceName,
            rate: rateStr,
            pitch: pitchStr
        });
        
        await tts.ttsPromise(textToSpeak, tempFile);
        
        if (fs.existsSync(tempFile)) {
            const audioBuffer = fs.readFileSync(tempFile);
            const base64Audio = audioBuffer.toString('base64');
            
            io.emit('play_tts_audio', {
                base64Audio,
                playLocation: chatbotSettings.playLocation
            });
            
            fs.unlinkSync(tempFile);
        }
    } catch (error) {
        console.error('Error generating Edge TTS:', error);
        if (fs.existsSync(tempFile)) {
            try { fs.unlinkSync(tempFile); } catch(e) {}
        }
    }
}



// ==========================================
// SPOTIFY REAL-TIME PLAYER API & POLLING
// ==========================================

let currentSpotifyTrack = { isPlaying: false };
let spotifyQueue = [];
let spotifyVoteSkips = new Set();

async function searchSpotify(query, type = 'track,artist', limit = 5) {
    if (!chatbotSettings.spotifyAccessToken) return null;
    
    if (Date.now() + 60000 >= chatbotSettings.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) return null;
    }
    
    try {
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${chatbotSettings.spotifyAccessToken}`
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
    if (!chatbotSettings.spotifyAccessToken) return false;
    if (Date.now() + 60000 >= chatbotSettings.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) return false;
    }
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${chatbotSettings.spotifyAccessToken}`,
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
    if (!chatbotSettings.spotifyAccessToken) return false;
    if (Date.now() + 60000 >= chatbotSettings.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) return false;
    }
    try {
        const response = await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${volumePercent}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${chatbotSettings.spotifyAccessToken}`
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
    if (!chatbotSettings.spotifyAccessToken) return false;
    if (Date.now() + 60000 >= chatbotSettings.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) return false;
    }
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${chatbotSettings.spotifyAccessToken}`
            }
        });
        return response.ok;
    } catch (err) {
        console.error('Error pausing Spotify:', err);
        return false;
    }
}

async function resumeSpotify() {
    if (!chatbotSettings.spotifyAccessToken) return false;
    if (Date.now() + 60000 >= chatbotSettings.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) return false;
    }
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${chatbotSettings.spotifyAccessToken}`
            }
        });
        return response.ok;
    } catch (err) {
        console.error('Error resuming Spotify:', err);
        return false;
    }
}

async function previousSpotifyTrack() {
    if (!chatbotSettings.spotifyAccessToken) return false;
    if (Date.now() + 60000 >= chatbotSettings.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) return false;
    }
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/previous', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${chatbotSettings.spotifyAccessToken}`
            }
        });
        return response.ok;
    } catch (err) {
        console.error('Error skipping to previous Spotify track:', err);
        return false;
    }
}

async function playNextInQueue() {
    if (spotifyQueue.length === 0) {
        try {
            const response = await fetch('https://api.spotify.com/v1/me/player/next', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${chatbotSettings.spotifyAccessToken}`
                }
            });
            currentActiveQueueTrack = null;
            return response.ok;
        } catch (e) {
            console.error('Error skipping to next native song:', e);
            return false;
        }
    }
    
    const nextTrack = spotifyQueue.shift();
    io.emit('spotify_queue_updated', spotifyQueue);
    
    spotifyVoteSkips.clear();
    io.emit('spotify_votes_updated', { votes: 0, limit: chatbotSettings.spotifyVoteSkipLimit });
    
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
    spotifyQueue.push(track);
    io.emit('spotify_queue_updated', spotifyQueue);
    console.info(`Agregado a la cola: ${track.title} - ${track.artist} (Pedido por @${track.requester})`);
    
    if (spotifyQueue.length === 1 && (!currentSpotifyTrack || !currentSpotifyTrack.isPlaying)) {
        playNextInQueue();
    }
}

function handleVoteSkip(requester, isStaff) {
    if (isStaff) {
        console.log(`Skip forzado por staff: @${requester}`);
        io.emit('system', { type: 'info', message: `@${requester} omitió la canción.` });
        playNextInQueue();
        return;
    }
    
    if (!currentSpotifyTrack || !currentSpotifyTrack.isPlaying) {
        return;
    }
    
    spotifyVoteSkips.add(requester);
    const votesNeeded = chatbotSettings.spotifyVoteSkipLimit || 3;
    const currentVotes = spotifyVoteSkips.size;
    
    io.emit('spotify_votes_updated', { votes: currentVotes, limit: votesNeeded });
    io.emit('system', { type: 'info', message: `@${requester} votó para omitir la canción. (${currentVotes}/${votesNeeded})` });
    
    if (currentVotes >= votesNeeded) {
        console.log(`Límite de votos alcanzado (${currentVotes}/${votesNeeded}). Omitiendo canción...`);
        io.emit('system', { type: 'info', message: `Límite de votos alcanzado. Omitiendo canción...` });
        playNextInQueue();
    }
}

async function handleSongRequest(query, requester) {
    if (!chatbotSettings.spotifyAccessToken) return;
    
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
                if (!chatbotSettings.spotifyExplicitAllowed) {
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
            const trackSearch = await searchSpotify(query, 'track', 1);
            if (trackSearch && trackSearch.tracks && trackSearch.tracks.items.length > 0) {
                chosenTrack = trackSearch.tracks.items[0];
            }
        } catch (e) {
            console.error('Error in track search:', e);
        }
    }
    
    if (!chosenTrack) {
        io.emit('system', { type: 'warning', message: `No se encontraron canciones para "${query}".` });
        return;
    }
    
    if (!chatbotSettings.spotifyExplicitAllowed && chosenTrack.explicit) {
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
    const votesNeeded = chatbotSettings.spotifyVoteSkipLimit || 3;
    const currentVotes = spotifyVoteSkips.size;
    io.emit('system', { 
        type: 'info', 
        message: `Votos para omitir: ${currentVotes}/${votesNeeded}` 
    });
}

async function handleSpotifyChatCommand(data) {
    if (!chatbotSettings.spotifyConnected || !chatbotSettings.spotifyEnabled || !chatbotSettings.spotifyChatQueueEnabled) {
        return;
    }

    const comment = (data.comment || '').trim();
    const uniqueId = data.uniqueId;
    const nickname = data.nickname || uniqueId;
    
    const isSubscriber = data.isSubscriber || (data.userIdentity && data.userIdentity.isSubscriberOfAnchor);
    const isModerator = data.isModerator || (data.userIdentity && data.userIdentity.isModeratorOfAnchor);
    const isAnchor = data.isAnchor || (data.userIdentity && data.userIdentity.isAnchor);
    
    const prefix = (chatbotSettings.spotifyCommandPrefix || '!song').trim();
    const lowerComment = comment.toLowerCase();
    
    if (lowerComment.startsWith(prefix.toLowerCase())) {
        const query = comment.substring(prefix.length).trim();
        if (query.length > 0) {
            const perm = chatbotSettings.spotifyPermission || 'all';
            if (perm === 'mods' && !isModerator && !isAnchor) {
                io.emit('system', { type: 'warning', message: `@${uniqueId} intentó pedir canción sin permisos (Mods).` });
                return;
            }
            if (perm === 'subs' && !isSubscriber && !isModerator && !isAnchor) {
                io.emit('system', { type: 'warning', message: `@${uniqueId} intentó pedir canción sin permisos (Subs).` });
                return;
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
        if (isModerator || isAnchor) {
            console.log(`Force skip por @${uniqueId}`);
            io.emit('system', { type: 'info', message: `@${uniqueId} omitió la canción.` });
            playNextInQueue();
        }
    } else if (lowerComment === '!clearqueue' || lowerComment === '!limpiarcola') {
        if (isModerator || isAnchor) {
            console.log(`Cola vaciada por @${uniqueId}`);
            spotifyQueue = [];
            io.emit('spotify_queue_updated', spotifyQueue);
            io.emit('system', { type: 'info', message: `@${uniqueId} vació la cola.` });
        }
    }
}

async function refreshSpotifyToken() {
    const clientId = chatbotSettings.spotifyClientId || 'd338de81e9fa498fb12b591b6c69784e';
    const clientSecret = chatbotSettings.spotifyClientSecret || '5ba2066fa2eb4df782bf6b9b3294eeec';
    
    if (!chatbotSettings.spotifyRefreshToken) {
        console.error('No refresh token available to renew Spotify session.');
        return false;
    }
    
    try {
        console.info('Refrescando token de Spotify...');
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: chatbotSettings.spotifyRefreshToken
            })
        });
        
        const data = await response.json();
        if (!response.ok || data.error) {
            console.error('Spotify token refresh error response:', data);
            return false;
        }
        
        chatbotSettings.spotifyAccessToken = data.access_token;
        chatbotSettings.spotifyExpiresAt = Date.now() + (data.expires_in * 1000);
        if (data.refresh_token) {
            chatbotSettings.spotifyRefreshToken = data.refresh_token;
        }
        
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
        io.emit('chatbot_settings_updated', chatbotSettings);
        console.info('Token de Spotify refrescado exitosamente.');
        return true;
    } catch (err) {
        console.error('Failed to refresh Spotify token:', err);
        return false;
    }
}

async function getSpotifyCurrentlyPlaying() {
    if (!chatbotSettings.spotifyConnected || !chatbotSettings.spotifyAccessToken) {
        return { isPlaying: false };
    }
    
    // Check if expired (or within 60s of expiration)
    if (Date.now() + 60000 >= chatbotSettings.spotifyExpiresAt) {
        const success = await refreshSpotifyToken();
        if (!success) {
            return { isPlaying: false };
        }
    }
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: {
                'Authorization': `Bearer ${chatbotSettings.spotifyAccessToken}`
            }
        });
        
        if (response.status === 204 || response.status === 404) {
            return { isPlaying: false };
        }
        
        if (!response.ok) {
            // If token expired unexpectedly
            if (response.status === 401) {
                console.info('Recibido 401 de Spotify. Intentando forzar refresco de token.');
                const success = await refreshSpotifyToken();
                if (success) {
                    // Retry once
                    return getSpotifyCurrentlyPlaying();
                }
            }
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

// Background Polling Loop
let lastTriggeredUri = null;
let currentActiveQueueTrack = null;

setInterval(async () => {
    if (chatbotSettings.spotifyConnected && chatbotSettings.spotifyEnabled) {
        try {
            const track = await getSpotifyCurrentlyPlaying();
            if (track) {
                // Si la canción está sonando y restan menos de 5 segundos
                if (track.isPlaying && track.durationMs && track.progressMs !== undefined) {
                    const remainingTime = track.durationMs - track.progressMs;
                    if (remainingTime <= 5000 && track.spotifyUrl !== lastTriggeredUri) {
                        console.log(`Finalización de track detectada (Restan: ${remainingTime}ms). Reproduciendo siguiente en cola...`);
                        lastTriggeredUri = track.spotifyUrl;
                        playNextInQueue();
                    }
                }
                
                // Limpiar bandera de skip si empezó una nueva canción
                if (track.isPlaying && track.spotifyUrl !== lastTriggeredUri) {
                    if (track.progressMs < 10000) {
                        lastTriggeredUri = null;
                        spotifyVoteSkips.clear();
                        io.emit('spotify_votes_updated', { votes: 0, limit: chatbotSettings.spotifyVoteSkipLimit });
                    }
                }

                currentSpotifyTrack = track;
                
                // Agregar el requester si esta canción proviene de nuestra cola
                if (currentActiveQueueTrack && (track.title === currentActiveQueueTrack.title || track.spotifyUrl === currentActiveQueueTrack.uri)) {
                    track.requester = currentActiveQueueTrack.requester;
                } else if (currentActiveQueueTrack && track.spotifyUrl !== currentActiveQueueTrack.uri) {
                    currentActiveQueueTrack = null;
                }
                
                io.emit('spotify_track', track);
            }
        } catch (e) {
            console.error('Error in Spotify background polling interval:', e);
        }
    }
}, 3000);



const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware to parse JSON payloads (for base64 uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = 3000;
const TIKTOK_USERNAME = 'nayamorningstar';

// Ensure upload directory exists in writable directory
const UPLOADS_DIR = path.join(writableDir, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve temporary files from the writable directory
app.use(express.static(writableDir));

// Serve uploads from the writable directory
app.use('/uploads', express.static(UPLOADS_DIR));

// Basic route for the control panel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for the overlay
app.get('/overlay', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// Route for Spotify Authorization Redirect
app.get('/spotify-login', (req, res) => {
    const clientId = chatbotSettings.spotifyClientId || 'd338de81e9fa498fb12b591b6c69784e';
    const redirectUri = 'http://127.0.0.1:3000/spotify-callback';
    const scopes = 'user-read-currently-playing user-read-playback-state user-read-private user-modify-playback-state';
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
    res.redirect(authUrl);
});

// Route for Spotify Authorization Callback
app.get('/spotify-callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.redirect('/?spotify=error&message=no_code');
    }
    
    const clientId = chatbotSettings.spotifyClientId || 'd338de81e9fa498fb12b591b6c69784e';
    const clientSecret = chatbotSettings.spotifyClientSecret || '5ba2066fa2eb4df782bf6b9b3294eeec';
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
        
        chatbotSettings.spotifyAccessToken = tokenData.access_token;
        chatbotSettings.spotifyRefreshToken = tokenData.refresh_token;
        chatbotSettings.spotifyExpiresAt = Date.now() + (tokenData.expires_in * 1000);
        chatbotSettings.spotifyUserName = userName;
        chatbotSettings.spotifyUserProfilePic = profilePic;
        chatbotSettings.spotifyUserCountry = profileData.country || 'US';
        chatbotSettings.spotifyConnected = true;
        chatbotSettings.spotifyEnabled = true;
        
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
        io.emit('chatbot_settings_updated', chatbotSettings);
        
        res.redirect('/?spotify=connected');
    } catch (err) {
        console.error('Error in Spotify Callback:', err);
        res.redirect('/?spotify=error&message=' + encodeURIComponent(err.message));
    }
});

// API: Get Custom Animations
app.get('/api/custom-animations', (req, res) => {
    res.json(chatbotSettings.customAnimations || []);
});

// API: Upload Custom Animation (Base64)
app.post('/api/custom-animations', (req, res) => {
    try {
        const { name, text, layer, duration, filename, fileData } = req.body;
        if (!name || !filename || !fileData) {
            return res.status(400).json({ error: 'Faltan campos requeridos (name, filename, fileData)' });
        }

        // Decode base64 data
        const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let buffer;
        if (matches && matches.length === 3) {
            buffer = Buffer.from(matches[2], 'base64');
        } else {
            buffer = Buffer.from(fileData, 'base64');
        }

        const safeFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const filePath = path.join(UPLOADS_DIR, safeFilename);
        fs.writeFileSync(filePath, buffer);

        const newAnim = {
            id: `anim_${Date.now()}`,
            name: name,
            text: text || '',
            layer: layer || 'front',
            duration: parseInt(duration || 5) * 1000, // store in ms
            filename: safeFilename,
            filepath: `/uploads/${safeFilename}`
        };

        if (!chatbotSettings.customAnimations) {
            chatbotSettings.customAnimations = [];
        }
        chatbotSettings.customAnimations.push(newAnim);

        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
        io.emit('chatbot_settings_updated', chatbotSettings);

        res.json({ success: true, animation: newAnim });
    } catch (err) {
        console.error('Error handling animation upload:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Delete Custom Animation
app.delete('/api/custom-animations/:id', (req, res) => {
    try {
        const { id } = req.params;
        if (!chatbotSettings.customAnimations) {
            chatbotSettings.customAnimations = [];
        }

        const animIdx = chatbotSettings.customAnimations.findIndex(a => a.id === id);
        if (animIdx === -1) {
            return res.status(404).json({ error: 'Animación no encontrada' });
        }

        const anim = chatbotSettings.customAnimations[animIdx];
        const filePath = path.join(UPLOADS_DIR, anim.filename);
        
        // Safely remove file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Remove animation from list
        chatbotSettings.customAnimations.splice(animIdx, 1);

        // Also clean up any MVP mapped to this animation
        if (chatbotSettings.mvpEntrances) {
            chatbotSettings.mvpEntrances = chatbotSettings.mvpEntrances.filter(m => m.animationId !== id);
        }

        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
        io.emit('chatbot_settings_updated', chatbotSettings);

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting animation:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Upload Master Animation Custom Override
app.post('/api/master-animations/:key', (req, res) => {
    try {
        const { key } = req.params;
        const { filename, fileData } = req.body;
        if (!filename || !fileData) {
            return res.status(400).json({ error: 'Faltan campos requeridos (filename, fileData)' });
        }

        const validKeys = ['trigger_glove', 'trigger_levelup', 'trigger_quiereme', 'trigger_x2'];
        if (!validKeys.includes(key)) {
            return res.status(400).json({ error: 'Clave de animación maestra inválida' });
        }

        // Decode base64 data
        const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let buffer;
        if (matches && matches.length === 3) {
            buffer = Buffer.from(matches[2], 'base64');
        } else {
            buffer = Buffer.from(fileData, 'base64');
        }

        // If there was a previous custom file, delete it
        if (!chatbotSettings.masterAnimations) {
            chatbotSettings.masterAnimations = {};
        }
        if (chatbotSettings.masterAnimations[key] && chatbotSettings.masterAnimations[key].filename) {
            const oldFilePath = path.join(UPLOADS_DIR, chatbotSettings.masterAnimations[key].filename);
            if (fs.existsSync(oldFilePath)) {
                try { fs.unlinkSync(oldFilePath); } catch (e) {}
            }
        }

        const safeFilename = `master_${key}_${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const filePath = path.join(UPLOADS_DIR, safeFilename);
        fs.writeFileSync(filePath, buffer);

        chatbotSettings.masterAnimations[key] = {
            filename: safeFilename,
            filepath: `/uploads/${safeFilename}`
        };

        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
        io.emit('chatbot_settings_updated', chatbotSettings);

        res.json({ success: true, override: chatbotSettings.masterAnimations[key] });
    } catch (err) {
        console.error('Error uploading master animation override:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Delete Master Animation Custom Override
app.delete('/api/master-animations/:key', (req, res) => {
    try {
        const { key } = req.params;
        const validKeys = ['trigger_glove', 'trigger_levelup', 'trigger_quiereme', 'trigger_x2'];
        if (!validKeys.includes(key)) {
            return res.status(400).json({ error: 'Clave de animación maestra inválida' });
        }

        if (!chatbotSettings.masterAnimations) {
            chatbotSettings.masterAnimations = {};
        }

        const override = chatbotSettings.masterAnimations[key];
        if (override && override.filename) {
            const filePath = path.join(UPLOADS_DIR, override.filename);
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) {}
            }
        }

        delete chatbotSettings.masterAnimations[key];

        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
        io.emit('chatbot_settings_updated', chatbotSettings);

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting master animation override:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Get MVP list
app.get('/api/mvps', (req, res) => {
    res.json(chatbotSettings.mvpEntrances || []);
});

// API: Register MVP
app.post('/api/mvps', (req, res) => {
    try {
        const { username, animationId } = req.body;
        if (!username || !animationId) {
            return res.status(400).json({ error: 'Faltan campos (username, animationId)' });
        }

        const cleanUser = username.replace('@', '').trim();
        if (!cleanUser) {
            return res.status(400).json({ error: 'Usuario inválido' });
        }

        const newMvp = {
            username: cleanUser,
            animationId: animationId,
            enabled: true
        };

        if (!chatbotSettings.mvpEntrances) {
            chatbotSettings.mvpEntrances = [];
        }

        // Remove existing mapping for this user if it exists
        chatbotSettings.mvpEntrances = chatbotSettings.mvpEntrances.filter(
            m => m.username.toLowerCase() !== cleanUser.toLowerCase()
        );

        chatbotSettings.mvpEntrances.push(newMvp);

        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
        io.emit('chatbot_settings_updated', chatbotSettings);

        res.json({ success: true, mvp: newMvp });
    } catch (err) {
        console.error('Error saving MVP entrance:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Toggle MVP enabled state
app.put('/api/mvps/:username/toggle', (req, res) => {
    try {
        const user = req.params.username.toLowerCase();
        const { enabled } = req.body;

        if (!chatbotSettings.mvpEntrances) {
            chatbotSettings.mvpEntrances = [];
        }

        const mvp = chatbotSettings.mvpEntrances.find(m => m.username.toLowerCase() === user);
        if (!mvp) {
            return res.status(404).json({ error: 'MVP no encontrado' });
        }

        mvp.enabled = !!enabled;

        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
        io.emit('chatbot_settings_updated', chatbotSettings);

        res.json({ success: true, mvp });
    } catch (err) {
        console.error('Error toggling MVP state:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Delete MVP mapping
app.delete('/api/mvps/:username', (req, res) => {
    try {
        const user = req.params.username.toLowerCase();
        if (chatbotSettings.mvpEntrances) {
            chatbotSettings.mvpEntrances = chatbotSettings.mvpEntrances.filter(
                m => m.username.toLowerCase() !== user
            );
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
            io.emit('chatbot_settings_updated', chatbotSettings);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting MVP mapping:', err);
        res.status(500).json({ error: err.message });
    }
});

// Route for Music Overlay Widget
app.get('/music-widget', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'music-widget.html'));
});

// Rankings update and retrieval helpers
function updateMvp(username, nickname) {
    const likes = rankings.likes[username] ? rankings.likes[username].count : 0;
    const gifts = rankings.gifts[username] ? rankings.gifts[username].count : 0;
    const mvpScore = (gifts * 10) + likes;
    
    if (mvpScore > 0) {
        rankings.mvp[username] = { nickname, count: mvpScore };
    }
}

function getTopRankings() {
    const sortCategory = (cat) => {
        return Object.entries(rankings[cat])
            .map(([username, data]) => ({ username, nickname: data.nickname, count: data.count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    };
    
    return {
        likes: sortCategory('likes'),
        gifts: sortCategory('gifts'),
        mvp: sortCategory('mvp')
    };
}

function broadcastRankings() {
    const topRankings = getTopRankings();
    io.emit('rankings_updated', topRankings);
}

// Custom TTS generator for follows, shares, likes milestone and gift events
async function speakCustomTts(text) {
    if (!chatbotSettings || !chatbotSettings.active) return;
    if (chatbotSettings.ttsEngine !== 'cloud') return;
    
    let voiceName = chatbotSettings.cloudVoiceName || 'es-CO-SalomeNeural';
    let volume = chatbotSettings.volume ?? 1;
    let pitch = chatbotSettings.pitch ?? 1;
    let rate = chatbotSettings.rate ?? 1;
    
    const tempFile = path.join(writableDir, `temp_tts_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp3`);
    
    const ratePercentage = Math.round((rate - 1) * 100);
    const rateStr = ratePercentage >= 0 ? `+${ratePercentage}%` : `${ratePercentage}%`;
    const pitchPercentage = Math.round((pitch - 1) * 50);
    const pitchStr = pitchPercentage >= 0 ? `+${pitchPercentage}Hz` : `${pitchPercentage}Hz`;
    
    try {
        const tts = new EdgeTTS({
            voice: voiceName,
            rate: rateStr,
            pitch: pitchStr
        });
        
        await tts.ttsPromise(text, tempFile);
        
        if (fs.existsSync(tempFile)) {
            const audioBuffer = fs.readFileSync(tempFile);
            const base64Audio = audioBuffer.toString('base64');
            
            io.emit('play_tts_audio', {
                base64Audio,
                playLocation: chatbotSettings.playLocation
            });
            
            fs.unlinkSync(tempFile);
        }
    } catch (error) {
        console.error('Error generating custom event TTS:', error);
        if (fs.existsSync(tempFile)) {
            try { fs.unlinkSync(tempFile); } catch(e) {}
        }
    }
}

let tiktokLiveConnection = null;

function connectToTikTok(username) {
    if (tiktokLiveConnection) {
        tiktokLiveConnection.disconnect();
    }
    
    tiktokLiveConnection = new WebcastPushConnection(username);
    
    tiktokLiveConnection.connect().then(state => {
        console.info(`Connected to roomId ${state.roomId}`);
        // Reset session rankings
        rankings = { likes: {}, gifts: {}, mvp: {} };
        broadcastRankings();
        io.emit('system', { type: 'connected', message: `Conectado a @${username}` });
    }).catch(err => {
        console.error('Failed to connect', err);
        io.emit('system', { type: 'error', message: `Fallo al conectar: ${err.message}` });
    });
    
    const eventsToListen = [
        'gift', 'chat', 'like', 'member', 'roomUserSeq', 'social', 
        'envelope', 'questionNew', 'linkMicBattle', 'linkMicArmies', 
        'liveIntro', 'emote', 'envelope', 'follow', 'share'
    ];

    eventsToListen.forEach(eventType => {
        tiktokLiveConnection.on(eventType, data => {
            io.emit('tiktok_event_raw', { eventType, data });
            
            if (eventType === 'chat') {
                handleCloudTTS(data);
                handleSpotifyChatCommand(data);
            }

            if (eventType === 'member') {
                // Check if user is registered as MVP and enabled
                const username = (data.uniqueId || '').toLowerCase();
                const mvp = (chatbotSettings.mvpEntrances || []).find(
                    m => m.username.toLowerCase() === username && m.enabled
                );
                if (mvp) {
                    const anim = (chatbotSettings.customAnimations || []).find(
                        a => a.id === mvp.animationId
                    );
                    
                    if (anim) {
                        io.emit('overlay_command', {
                            action: 'play_custom_animation',
                            animation: anim,
                            nickname: data.nickname || data.uniqueId
                        });
                    } else if (mvp.animationId.startsWith('trigger_')) {
                        // It's a default animation (trigger_glove, etc.)
                        io.emit('overlay_command', {
                            action: 'test_trigger',
                            event: mvp.animationId,
                            nickname: data.nickname || data.uniqueId
                        });
                    }
                }
            }

            if (eventType === 'gift') {
                io.emit('overlay_trigger', {
                    type: 'gift',
                    giftId: data.giftId,
                    giftName: data.giftName,
                    sender: data.nickname,
                    repeatCount: data.repeatCount,
                    diamondCount: data.diamondCount,
                    extendedGiftInfo: data.extendedGiftInfo
                });

                const uniqueId = (data.uniqueId || '').toLowerCase();
                const nickname = data.nickname || data.uniqueId;
                const coins = data.diamondCount || 0;
                
                if (uniqueId && coins > 0) {
                    if (!rankings.gifts[uniqueId]) {
                        rankings.gifts[uniqueId] = { nickname, count: 0 };
                    }
                    rankings.gifts[uniqueId].count += coins;
                    
                    updateMvp(uniqueId, nickname);
                    broadcastRankings();
                }

                // Blacklist check
                const blacklist = (chatbotSettings.ignoreUserList || []).map(u => u.toLowerCase().trim());
                if (!blacklist.includes(uniqueId)) {
                    // Check if it is the end of a repeat combo or a single gift
                    const isComboEnd = data.repeatEnd || !data.extendedGiftInfo || !data.extendedGiftInfo.combo;
                    if (chatbotSettings.readGiftsEnabled && isComboEnd) {
                        const giftName = data.giftName;
                        const count = data.repeatCount || 1;
                        let ttsText = "";
                        const theme = chatbotSettings.themeName || 'neutral';
                        if (theme === 'naya') {
                            ttsText = `¡Wow, muchísimas gracias @${nickname} por regalar ${count} ${giftName} a Naya!`;
                        } else if (theme === 'majo') {
                            ttsText = `¡Gracias @${nickname} por enviar ${count} ${giftName} al directo de Majo!`;
                        } else {
                            ttsText = `¡Gracias @${nickname} por regalar ${count} ${giftName}!`;
                        }
                        speakCustomTts(ttsText);
                    }
                }
            }

            if (eventType === 'like') {
                const uniqueId = (data.uniqueId || '').toLowerCase();
                const nickname = data.nickname || data.uniqueId;
                const count = data.likeCount || 1;
                
                if (uniqueId) {
                    if (!rankings.likes[uniqueId]) {
                        rankings.likes[uniqueId] = { nickname, count: 0 };
                    }
                    rankings.likes[uniqueId].count += count;
                    
                    updateMvp(uniqueId, nickname);
                    broadcastRankings();
                }

                // Blacklist check
                const blacklist = (chatbotSettings.ignoreUserList || []).map(u => u.toLowerCase().trim());
                if (!blacklist.includes(uniqueId)) {
                    // Cloud TTS milestone check
                    if (chatbotSettings.readLikesMilestoneEnabled && count >= (chatbotSettings.likesMilestoneValue || 100)) {
                        let ttsText = "";
                        const theme = chatbotSettings.themeName || 'neutral';
                        if (theme === 'naya') {
                            ttsText = `¡Muchísimas gracias @${nickname} por esos ${count} corazones en la pantalla de Naya!`;
                        } else if (theme === 'majo') {
                            ttsText = `¡Gracias por esos ${count} likes a la telaraña de Majo, @${nickname}!`;
                        } else {
                            ttsText = `¡Gracias @${nickname} por enviar ${count} likes a la transmisión!`;
                        }
                        speakCustomTts(ttsText);
                    }
                }
            }

            if (eventType === 'follow') {
                const uniqueId = (data.uniqueId || '').toLowerCase();
                const nickname = data.nickname || data.uniqueId || 'Nuevo Seguidor';
                
                // Blacklist check
                const blacklist = (chatbotSettings.ignoreUserList || []).map(u => u.toLowerCase().trim());
                if (!blacklist.includes(uniqueId)) {
                    if (chatbotSettings.readFollowsEnabled) {
                        let ttsText = "";
                        const theme = chatbotSettings.themeName || 'neutral';
                        if (theme === 'naya') {
                            ttsText = `¡Bienvenido @${nickname} a la transmisión de Naya! Gracias por seguirme, linda.`;
                        } else if (theme === 'majo') {
                            ttsText = `¡Bienvenido @${nickname} a la telaraña de Majo! Gracias por unirte a nosotros.`;
                        } else {
                            ttsText = `¡Bienvenido @${nickname}, gracias por seguir la cuenta!`;
                        }
                        speakCustomTts(ttsText);
                    }
                }
            }

            if (eventType === 'share') {
                const uniqueId = (data.uniqueId || '').toLowerCase();
                const nickname = data.nickname || data.uniqueId || 'Espectador';
                
                // Blacklist check
                const blacklist = (chatbotSettings.ignoreUserList || []).map(u => u.toLowerCase().trim());
                if (!blacklist.includes(uniqueId)) {
                    if (chatbotSettings.readSharesEnabled) {
                        let ttsText = "";
                        const theme = chatbotSettings.themeName || 'neutral';
                        if (theme === 'naya') {
                            ttsText = `¡Muchísimas gracias @${nickname} por compartir el directo de Naya! Eres un sol.`;
                        } else if (theme === 'majo') {
                            ttsText = `¡Gracias @${nickname} por compartir el live de Majo! Súper genial.`;
                        } else {
                            ttsText = `¡Gracias @${nickname} por compartir la transmisión!`;
                        }
                        speakCustomTts(ttsText);
                    }
                }
            }
            
            if (eventType === 'linkMicBattle') {
                io.emit('overlay_trigger', {
                    type: 'battle_event',
                    data: data
                });
            }
        });
    });
}

// Initial connection
if (chatbotSettings.autoConnect !== false && chatbotSettings.tiktokUsername) {
    const userToConnect = chatbotSettings.tiktokUsername;
    console.info(`Auto-conectando a TikTok con usuario: @${userToConnect}`);
    connectToTikTok(userToConnect);
} else {
    console.info("No hay usuario de TikTok configurado para auto-conexión.");
}

io.on('connection', (socket) => {
    console.log('Un cliente se ha conectado (Panel u Overlay)');
    
    // Send current chatbot settings on connection
    socket.emit('chatbot_settings_updated', chatbotSettings);
    socket.emit('app_version', packageJson.version);
    socket.emit('rankings_updated', getTopRankings());

    // Send local IPs on connection
    socket.emit('local_ips', getLocalIPs());

    // Send Spotify queue and votes on connection
    socket.emit('spotify_queue_updated', spotifyQueue);
    socket.emit('spotify_votes_updated', { votes: spotifyVoteSkips.size, limit: chatbotSettings.spotifyVoteSkipLimit });

    // Relay manual control commands from the panel to the overlay
    socket.on('manual_control', (data) => {
        io.emit('overlay_command', data);
    });

    // Handle chatbot settings updates
    socket.on('update_chatbot_settings', (newSettings) => {
        const oldVolume = chatbotSettings.spotifyVolume;
        chatbotSettings = { ...chatbotSettings, ...newSettings };
        
        if (chatbotSettings.tiktokUsername) {
            const usernameLower = chatbotSettings.tiktokUsername.toLowerCase();
            if (usernameLower.includes('majo')) {
                chatbotSettings.themeName = 'majo';
            } else if (usernameLower.includes('naya')) {
                chatbotSettings.themeName = 'naya';
            } else {
                chatbotSettings.themeName = 'neutral';
            }
        } else {
            chatbotSettings.themeName = 'neutral';
        }
        
        if (newSettings.spotifyVolume !== undefined && newSettings.spotifyVolume !== oldVolume) {
            setSpotifyVolume(chatbotSettings.spotifyVolume);
        }
        
        try {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
            io.emit('chatbot_settings_updated', chatbotSettings);
        } catch (err) {
            console.error('Error saving chatbot settings:', err);
        }
    });

    // Handle test cloud tts request
    socket.on('test_cloud_tts', async (data) => {
        const { text, voiceName, pitch, rate } = data;
        const tempFile = path.join(writableDir, `temp_test_${Date.now()}.mp3`);
        
        const ratePercentage = Math.round((rate - 1) * 100);
        const rateStr = ratePercentage >= 0 ? `+${ratePercentage}%` : `${ratePercentage}%`;
        const pitchPercentage = Math.round((pitch - 1) * 50);
        const pitchStr = pitchPercentage >= 0 ? `+${pitchPercentage}Hz` : `${pitchPercentage}Hz`;
        
        try {
            const tts = new EdgeTTS({
                voice: voiceName || 'es-CO-SalomeNeural',
                rate: rateStr,
                pitch: pitchStr
            });
            
            await tts.ttsPromise(text, tempFile);
            
            if (fs.existsSync(tempFile)) {
                const audioBuffer = fs.readFileSync(tempFile);
                const base64Audio = audioBuffer.toString('base64');
                socket.emit('play_tts_audio', { base64Audio, playLocation: 'panel' });
                fs.unlinkSync(tempFile);
            }
        } catch (error) {
            console.error('Error testing Edge TTS:', error);
            if (fs.existsSync(tempFile)) {
                try { fs.unlinkSync(tempFile); } catch(e) {}
            }
        }
    });

    // Handle disconnect tiktok request
    socket.on('disconnect_tiktok', () => {
        if (tiktokLiveConnection) {
            console.log('Desconectando de TikTok...');
            tiktokLiveConnection.disconnect();
            tiktokLiveConnection = null;
            io.emit('system', { type: 'error', message: 'DESCONECTADO' });
        }
    });

    // Handle disconnect spotify request
    socket.on('disconnect_spotify', () => {
        console.log('Desvinculando Spotify...');
        chatbotSettings.spotifyAccessToken = '';
        chatbotSettings.spotifyRefreshToken = '';
        chatbotSettings.spotifyExpiresAt = 0;
        chatbotSettings.spotifyUserName = '';
        chatbotSettings.spotifyUserProfilePic = '';
        chatbotSettings.spotifyConnected = false;
        chatbotSettings.spotifyEnabled = false;
        try {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
            io.emit('chatbot_settings_updated', chatbotSettings);
        } catch (err) {
            console.error('Error saving settings after Spotify disconnect:', err);
        }
    });

    // Handle user change
    socket.on('change_user', (data) => {
        const { username } = data;
        if (username) {
            console.log(`Cambiando conexión a @${username}`);
            
            // Auto-detect theme based on TikTok username
            chatbotSettings.tiktokUsername = username;
            const usernameLower = username.toLowerCase();
            if (usernameLower.includes('majo')) {
                chatbotSettings.themeName = 'majo';
            } else if (usernameLower.includes('naya')) {
                chatbotSettings.themeName = 'naya';
            } else {
                chatbotSettings.themeName = 'neutral';
            }
            
            try {
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
                io.emit('chatbot_settings_updated', chatbotSettings);
            } catch (err) {
                console.error('Error saving settings during change_user:', err);
            }
            
            io.emit('system', { type: 'system', message: `Desconectando y cambiando a @${username}...` });
            connectToTikTok(username);
        }
    });

    // Queue control events
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
            io.emit('spotify_votes_updated', { votes: 0, limit: chatbotSettings.spotifyVoteSkipLimit });
            
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

server.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});
