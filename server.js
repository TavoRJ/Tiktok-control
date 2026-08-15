process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');
const fs = require('fs');
const { EdgeTTS } = require('node-edge-tts');
const os = require('os');
const packageJson = require('./package.json');
const ytdl = require('@distube/ytdl-core');
const play = require('play-dl');

var io = null;

// Known fallback public Cobalt instances
let workingCobaltApis = [
    "https://api.cobalt.blackcat.sweeux.org",
    "https://apicobalt.mgytr.top",
    "https://subito-c.meowing.de",
    "https://api.qwkuns.me",
    "https://dog.kittycat.boo",
    "https://rue-cobalt.xenon.zone",
    "https://nuko-c.meowing.de",
    "https://cobaltapi.kittycat.boo"
];

async function updateCobaltApis() {
    try {
        console.log('[Cobalt Audio] Actualizando instancias de Cobalt desde cobalt.directory...');
        const res = await fetch('https://cobalt.directory/api/working?type=api', {
            signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
            const data = await res.json();
            if (data && data.youtube && Array.isArray(data.youtube) && data.youtube.length > 0) {
                workingCobaltApis = data.youtube;
                console.log('[Cobalt Audio] Lista de Cobalt APIs actualizada con éxito:', workingCobaltApis);
            } else if (data && data.Frontend && Array.isArray(data.Frontend) && data.Frontend.length > 0) {
                workingCobaltApis = data.Frontend;
                console.log('[Cobalt Audio] Lista de Cobalt APIs actualizada (Frontend fallback):', workingCobaltApis);
            }
        }
    } catch (err) {
        console.error('[Cobalt Audio] Error al actualizar las Cobalt APIs:', err.message);
    }
}

const writableDir = process.env.USER_DATA_PATH || __dirname;
// Base fallback paths
const DEFAULT_SETTINGS_FILE = path.join(writableDir, 'chatbot_settings.json');
const DEFAULT_SOUNDS_CONFIG_FILE = path.join(writableDir, 'sounds_config.json');
const DEFAULT_DINAMICAS_CONFIG_FILE = path.join(writableDir, 'dinamicas_config.json');
const DEFAULT_RECETAS_CONFIG_FILE = path.join(writableDir, 'recetas_config.json');
const DEFAULT_GOALS_CATALOG_FILE = path.join(writableDir, 'goals_catalog.json');

// Active mutable config paths (initially pointing to defaults)
let SETTINGS_FILE = DEFAULT_SETTINGS_FILE;
let SOUNDS_CONFIG_FILE = DEFAULT_SOUNDS_CONFIG_FILE;
let DINAMICAS_CONFIG_FILE = DEFAULT_DINAMICAS_CONFIG_FILE;
let RECETAS_CONFIG_FILE = DEFAULT_RECETAS_CONFIG_FILE;
let GOALS_CATALOG_FILE = DEFAULT_GOALS_CATALOG_FILE;

// Safely intercept fs.writeFileSync locally to prevent any configuration JSON corruption
const originalWriteFileSync = fs.writeFileSync;
fs.writeFileSync = function(filePath, data, options) {
    const isTargetConfigFile = 
        filePath === SETTINGS_FILE || 
        filePath === SOUNDS_CONFIG_FILE || 
        filePath === DINAMICAS_CONFIG_FILE || 
        filePath === RECETAS_CONFIG_FILE || 
        filePath === GOALS_CATALOG_FILE ||
        filePath === DEFAULT_SETTINGS_FILE ||
        filePath === DEFAULT_SOUNDS_CONFIG_FILE ||
        filePath === DEFAULT_DINAMICAS_CONFIG_FILE ||
        filePath === DEFAULT_RECETAS_CONFIG_FILE ||
        filePath === DEFAULT_GOALS_CATALOG_FILE;

    if (isTargetConfigFile) {
        try {
            // Verificar validez del contenido si es JSON en formato string
            if (typeof data === 'string') {
                JSON.parse(data);
            }
            
            let tempBackup = null;
            if (fs.existsSync(filePath)) {
                tempBackup = filePath + '.tmp';
                originalWriteFileSync(tempBackup, fs.readFileSync(filePath), 'utf8');
            }
            
            originalWriteFileSync(filePath, data, options);
            
            // Validar que quedó legible tras ser escrito
            const verifyContent = fs.readFileSync(filePath, 'utf8');
            JSON.parse(verifyContent);
            
            if (tempBackup && fs.existsSync(tempBackup)) {
                fs.unlinkSync(tempBackup);
            }
        } catch (err) {
            console.error(`[Guardado Seguro FS] Falló la escritura en ${filePath}. Restaurando versión anterior...`, err);
            const tempBackup = filePath + '.tmp';
            if (fs.existsSync(tempBackup)) {
                try {
                    originalWriteFileSync(filePath, fs.readFileSync(tempBackup), options);
                    fs.unlinkSync(tempBackup);
                    console.info(`[Guardado Seguro FS] Versión anterior restaurada con éxito.`);
                } catch (restoreErr) {
                    console.error(`[Guardado Seguro FS] Error crítico restaurando el respaldo:`, restoreErr);
                }
            }
            throw err;
        }
    } else {
        return originalWriteFileSync(filePath, data, options);
    }
};

// Ensure writable directories exist
if (process.env.USER_DATA_PATH && !fs.existsSync(writableDir)) {
    fs.mkdirSync(writableDir, { recursive: true });
}

// ============================================================
// CATÁLOGO CEREBRO: gifts_mapping.json
// Archivo maestro que recibe todos los registros de regalos
// en tiempo real desde TikTok Live.
// Debe vivir en writableDir (igual que todos los configs) para
// ser escribible tanto en modo dev como en el .exe instalado.
// ============================================================
const GIFTS_MAPPING_FILE = path.join(writableDir, 'gifts_mapping.json');
const BUNDLE_GIFTS_MAPPING_FILE = path.join(__dirname, 'gifts_mapping.json');

// Recommended banned terms list (groserías, insultos y albures mexicanos comunes)
const RECOMMENDED_BANNED_WORDS = [
    "verga", "puto", "puta", "mierda", "pendejo", "pendeja", "concha", "culo", "culero", "culera", "maricon", "maricón", 
    "joto", "zorra", "estupido", "estúpido", "estupida", "estúpida", "cagon", "cagón", "chinga", "chingar", "chingao", 
    "cabron", "cabrón", "orto", "tetas", "mamon", "mamón", "pene", "vagina", "ano", "singar", "cojer",
    "caverga", "caver ga", "querri caver ga", "querri caverga", "elver galarga", "elvergalarga", "elver ga", 
    "rosa melano", "rosamelano", "rosame lano", "benito camelas", "benitocamelas", "benito ca", "lomas turbas", 
    "lomasturbas", "lomas turba", "manguera", "chupa", "chupalo", "chúpalo", "mamalo", "mámalo", "debora melo", 
    "deboramelo", "chupa melo", "chupamelo", "chupa pito", "chupapito", "chupa verga", "chupaverga", "techo ca",
    "elber", "galarga", "melano", "camelan", "camelar", "camelas", "turbas", "aquiles baeza", "aquilesbaeza", 
    "aquiles ba", "teco ge", "tecoge", "telas pon", "telaspon", "telas po", "melochupas", "melo chupas",
    "me lo chupas", "chupamelapija", "chupame la pija", "hijo de puta", "hijodeputa", "hijo de perra", 
    "hijodeperra", "chupatela", "chúpatela", "mamas", "mamadas", "mamada", "soplapollas", "sopla pollas"
];

function createBackup(filePath, suffix = '') {
    try {
        if (!fs.existsSync(filePath)) return null;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${filePath}.${timestamp}${suffix}.bak`;
        fs.copyFileSync(filePath, backupPath);
        console.info(`[Cerebro] Backup creado: ${backupPath}`);
        return backupPath;
    } catch (err) {
        console.error(`[Cerebro] No se pudo crear backup de ${filePath}:`, err);
        return null;
    }
}

function readJsonFileSafe(filePath, defaultValue = {}) {
    if (!fs.existsSync(filePath)) return defaultValue;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return raw.trim() ? JSON.parse(raw) : defaultValue;
    } catch (err) {
        const backupPath = createBackup(filePath, '.invalid');
        console.error(`[Cerebro] Error leyendo JSON en ${filePath}. Se respaldó el archivo corrupto en ${backupPath}:`, err);
        return defaultValue;
    }
}

function writeJsonFileSafe(filePath, data) {
    try {
        const content = JSON.stringify(data, null, 2);
        JSON.parse(content); // Validar estructura
        
        let tempBackup = null;
        if (fs.existsSync(filePath)) {
            tempBackup = filePath + '.tmp';
            fs.copyFileSync(filePath, tempBackup);
        }
        
        fs.writeFileSync(filePath, content, 'utf8');
        
        // Verificar que quedó legible
        const verifyContent = fs.readFileSync(filePath, 'utf8');
        JSON.parse(verifyContent);
        
        if (tempBackup && fs.existsSync(tempBackup)) {
            fs.unlinkSync(tempBackup);
        }
        return true;
    } catch (err) {
        console.error(`[Guardado Seguro] Falló la escritura en ${filePath}. Restaurando respaldo temporal...`, err);
        const tempBackup = filePath + '.tmp';
        if (fs.existsSync(tempBackup)) {
            try {
                fs.copyFileSync(tempBackup, filePath);
                fs.unlinkSync(tempBackup);
                console.info(`[Guardado Seguro] Respaldo anterior restaurado con éxito.`);
            } catch (restoreErr) {
                console.error(`[Guardado Seguro] Error crítico restaurando el respaldo:`, restoreErr);
            }
        }
        throw err;
    }
}

function mergeGiftsMappingFromBundle() {
    try {
        const bundleExists = fs.existsSync(BUNDLE_GIFTS_MAPPING_FILE);
        const userExists = fs.existsSync(GIFTS_MAPPING_FILE);
        const bundleData = bundleExists ? readJsonFileSafe(BUNDLE_GIFTS_MAPPING_FILE, {}) : {};
        const userData = userExists ? readJsonFileSafe(GIFTS_MAPPING_FILE, {}) : {};

        if (!userExists) {
            if (bundleExists) {
                fs.writeFileSync(GIFTS_MAPPING_FILE, JSON.stringify(bundleData, null, 2), 'utf8');
                console.info('[Cerebro] gifts_mapping.json inicializado desde el bundle en writableDir:', GIFTS_MAPPING_FILE);
            } else {
                fs.writeFileSync(GIFTS_MAPPING_FILE, JSON.stringify({}, null, 2), 'utf8');
                console.info('[Cerebro] gifts_mapping.json creado nuevo en writableDir:', GIFTS_MAPPING_FILE);
            }
            return;
        }

        let merged = false;
        const defaultName = (id) => `Gift ${id}`;

        for (const giftId of Object.keys(bundleData)) {
            const bundleEntry = bundleData[giftId];
            if (!userData[giftId]) {
                userData[giftId] = bundleEntry;
                merged = true;
                continue;
            }

            const userEntry = userData[giftId];
            if ((!userEntry.name || userEntry.name.trim() === '' || userEntry.name === defaultName(giftId)) && bundleEntry.name) {
                userEntry.name = bundleEntry.name;
                merged = true;
            }
            if ((!userEntry.coins || userEntry.coins <= 0) && bundleEntry.coins) {
                userEntry.coins = bundleEntry.coins;
                merged = true;
            }
            if ((!userEntry.image || userEntry.image.trim() === '') && bundleEntry.image) {
                userEntry.image = bundleEntry.image;
                merged = true;
            }
        }

        if (merged) {
            createBackup(GIFTS_MAPPING_FILE);
            fs.writeFileSync(GIFTS_MAPPING_FILE, JSON.stringify(userData, null, 2), 'utf8');
            console.info('[Cerebro] gifts_mapping.json fusionado con el bundle sin borrar datos existentes:', GIFTS_MAPPING_FILE);
        } else {
            console.info('[Cerebro] No fue necesario fusionar gifts_mapping.json; el archivo del usuario ya estaba completo.');
        }
    } catch (err) {
        console.error('[Cerebro] Error al fusionar gifts_mapping.json desde el bundle:', err);
    }
}

try {
    mergeGiftsMappingFromBundle();
} catch (err) {
    console.error('[Cerebro] Error al inicializar gifts_mapping.json:', err);
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
    geminiModel: "gemini-3.1-flash-tts",
    geminiVoiceName: "Aoede",
    geminiStyleInstructions: "Read aloud in a warm, welcoming tone.",
    geminiLanguage: "es-MX",
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
    geminiApiKey: "",
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
    spotifySkipAllowedUsers: "",
    spotifyNeonColor: "cyan",
    songlistColor: "cyan",
    ttsWaveColor: "cyan",
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
    likesMilestoneValue: 100,
    shareAction: "read",
    shareSound: "",
    followAction: "read",
    followSound: "",
    giftAction: "read",
    giftSound: "",
    likeAction: "read",
    likeSound: "",
    thankYouLikePhrase: "",
    // Music request monetization settings
    spotifyMonetizationEnabled: false,
    spotifyMinCoins: 5,
    // Sound alerts multimedia settings
    soundAlertsEnabled: true,
    soundAlerts: [],
    customSounds: [],
    giftMetadata: {},
    goals: [],
    wheelEnabled: false,
    wheelTriggerCoins: 10,
    wheelTriggerGift: "any",
    wheelOptions: ["5 Sentadillas", "Cantar un fragmento", "Contar un chiste", "Saludar como ardilla", "Omitir canción gratis", "Hacer una mueca graciosa"],
    overlayMusicQueueEnabled: true,
    overlayChatEnabled: true,
    overlayChatFilterPremium: true,
    ttsEffectsEnabled: true,
    recipeGoalColor: "#ff477e",
    bannerSlide1: "Ejemplo de texto",
    bannerSlide2: "¡Pide tu canción en el chat usando !song 🎵",
    bannerSlide3: "Meta de Regalos Activa (Calculada automáticamente)",
    widgets: {
        spotify: { active: false, x: 5, y: 70, width: 90, height: 15 },
        banner: { active: false, x: 0, y: 0, width: 100, height: 8 },
        donors: { active: false, x: 5, y: 10, width: 90, height: 10 },
        taps: { active: false, x: 5, y: 22, width: 90, height: 10 },
        mvp: { active: false, x: 5, y: 34, width: 90, height: 10 },
        songlist: { active: false, x: 5, y: 46, width: 90, height: 12 },
        recetas: { active: false, x: 5, y: 59, width: 90, height: 10 },
        dinamicas: { active: false, x: 5, y: 70, width: 90, height: 10 },
        ruleta: { active: false, x: 5, y: 30, width: 90, height: 40 },
        socials: { active: false, x: 5, y: 82, width: 90, height: 8 },
        tts: { active: false, x: 25, y: 5, width: 50, height: 12 }
    },
    globalWidgetStyles: {
        fontFamily: "Outfit",
        borderThickness: 2,
        borderColor: "#00f0ff",
        bgColor: "#0f0a19",
        bgOpacity: 0,
        textScale: 100
    },
    ai: {
        naya: {
            ai_bot_active: false,
            ai_monetization_active: false,
            ai_min_coins: 5,
            ai_max_chars: 150,
            ai_cooldown: 10,
            ai_read_username: true,
            ai_prompt_personality: "Habla como un chibi rosa tierno, dulce y alegre."
        },
        majo: {
            ai_bot_active: false,
            ai_monetization_active: false,
            ai_min_coins: 10,
            ai_max_chars: 150,
            ai_cooldown: 10,
            ai_read_username: true,
            ai_prompt_personality: "Habla como Gojo de forma sarcástica, confiada y misteriosa con toques oscuros."
        }
    },
    apuestas: {
        enabled: false,
        title: "¿Quién ganará hoy?",
        count: 4,
        p1: { name: "Participante 1", giftId: "8913", giftName: "Rosa", votes: 0, voters: [] },
        p2: { name: "Participante 2", giftId: "9947", giftName: "BFF Necklace", votes: 0, voters: [] },
        p3: { name: "Participante 3", giftId: "45", giftName: "Corazón", votes: 0, voters: [] },
        p4: { name: "Participante 4", giftId: "46", giftName: "Confeti", votes: 0, voters: [] }
    }
};

// Global in-memory rankings database for active stream session
let rankings = {
    likes: {},  // { username: { nickname, count, profilePictureUrl } }
    gifts: {},  // { username: { nickname, count, profilePictureUrl } }
    mvp: {}     // { username: { nickname, count, profilePictureUrl } }
};

// Global cache for the current creator's profile picture
let currentCreatorAvatar = '';
let currentRoomId = '';

// Global session stats for persistence and real-time dashboard tracking
let totalSessionDiamonds = 0;
let totalSessionLikes = 0;
let totalSessionViewers = 0;



// User credits for request monetization (in-memory)
let userMusicCredits = {};
let userAiCredits = {};
let lastAiCallTime = 0;
let aiCommandQueue = [];
let isAiProcessing = false;
let aiQueueCounter = 0;
let aiChatHistory = []; // Buffer for multi-turn conversation window (max 8 turns)

// Track gift coins received per user in current session (for monetization)
let sessionGiftCoins = {}; // { uniqueId: totalCoinsReceivedThisSession }

// Dictionary of TikTok Gift ID -> { name, coins }
const tiktokGiftDatabase = {
    5655: { name: 'Rose', coins: 1 },
    7934: { name: 'Heart Me', coins: 1 },
    5266: { name: 'Ice Cream', coins: 1 },
    5585: { name: 'Weights', coins: 1 },
    5620: { name: 'Glow-in-the-Dark Wand', coins: 1 },
    5617: { name: 'GG', coins: 1 },
    5760: { name: 'Finger Heart', coins: 5 },
    5659: { name: 'Mini Fridge', coins: 10 },
    5660: { name: 'Perfume', coins: 20 },
    5879: { name: 'Doughnut', coins: 30 },
    5509: { name: 'Paper Crane', coins: 99 },
    7163: { name: 'Mishka Bear', coins: 100 },
    5763: { name: 'Boxing Gloves', coins: 299 },
    6042: { name: 'Galaxy', coins: 1000 },
    6424: { name: 'Fireworks', coins: 1088 }
};

let remoteGiftsCatalog = {};

function getGiftCoinValue(data) {
    if (!data) return 1;
    const giftId = String(data.giftId);
    
    // 1. Try resolving from remoteGiftsCatalog (Auth Server sync)
    if (remoteGiftsCatalog[giftId] && remoteGiftsCatalog[giftId].diamond_count !== undefined) {
        return parseInt(remoteGiftsCatalog[giftId].diamond_count) || 1;
    }

    // 2. Try resolving from local gifts_mapping.json (cerebro)
    try {
        const brainData = readJsonFileSafe(GIFTS_MAPPING_FILE, {});
        if (brainData && brainData[giftId] && brainData[giftId].coins !== undefined) {
            return parseInt(brainData[giftId].coins) || 1;
        }
    } catch (e) {
        console.error('[Cerebro] Error reading coin value from mapping:', e);
    }
    
    // 3. Fallback to hardcoded TikTok database
    const dbGift = tiktokGiftDatabase[parseInt(giftId)];
    if (dbGift) {
        return dbGift.coins;
    }
    
    // 4. Last fallback
    return data.diamondCount || 1;
}



function giftNamesMatch(trigger, giftName) {
    if (!trigger || !giftName) return false;
    const cleanTrigger = trigger.toLowerCase().trim();
    const cleanGiftName = giftName.toLowerCase().trim();
    if (cleanTrigger === cleanGiftName) return true;
    if (cleanTrigger === 'any') return true;
    
    // Normalized checks (stripping spaces & accents) in English natively
    const normalizeString = (str) => {
        return str.normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "");
    };
    return normalizeString(cleanTrigger) === normalizeString(cleanGiftName);
}

function updateGoalProgress(type, amount, giftName = null) {
    if (!chatbotSettings.goals || !Array.isArray(chatbotSettings.goals) || chatbotSettings.goals.length === 0) return;
    
    let updated = false;
    let activeGoalUpdated = false;
    const activeGoal = chatbotSettings.goals.find(g => g.type === 'gift' && g.enabled);
    
    chatbotSettings.goals.forEach(goal => {
        if (!goal.enabled) return;
        
        let match = false;
        if (goal.type === type) {
            if (type === 'gift') {
                if (goal.giftName && goal.giftName !== 'any') {
                    if (giftNamesMatch(goal.giftName, giftName)) {
                        match = true;
                    }
                } else {
                    match = true;
                }
            } else {
                match = true;
            }
        }
        
        if (match) {
            goal.current = (goal.current || 0) + amount;
            if (goal.current > goal.target) goal.current = goal.target;
            updated = true;
            if (goal === activeGoal) {
                activeGoalUpdated = true;
            }
        }
    });
    
    if (updated) {
        try {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
            io.emit('goals_updated', chatbotSettings.goals);
            io.emit('chatbot_settings_updated', chatbotSettings);
            
            if (activeGoalUpdated && activeGoal) {
                io.emit('meta_goal_updated', {
                    giftName: activeGoal.giftName,
                    current: activeGoal.current,
                    target: activeGoal.target
                });
            }
        } catch (e) {
            console.error('Error saving updated goal progress:', e);
        }
    }
}

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



// Helper to parse duration string (like "2:24") to milliseconds
function parseDurationToMs(durationStr) {
    if (!durationStr) return 0;
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 2) {
        return (parts[0] * 60 + parts[1]) * 1000;
    } else if (parts.length === 3) {
        return ((parts[0] * 60 + parts[1]) * 60 + parts[2]) * 1000;
    }
    return Number(durationStr) * 1000 || 0;
}

// Search and retrieve track details from SoundCloud using play-dl
async function searchSoundCloud(query) {
    try {
        console.log(`[SoundCloud] Buscando: "${query}"...`);
        // Get free Client ID dynamically
        const client_id = await play.getFreeClientID();
        await play.setToken({
            soundcloud: {
                client_id: client_id
            }
        });

        const results = await play.search(query, {
            limit: 1,
            source: { soundcloud: 'tracks' }
        });

        if (results && results.length > 0) {
            const track = results[0];
            const durationSec = track.durationInSec || 0;
            const durationMs = durationSec * 1000;
            
            // Format duration as minutes:seconds
            const mins = Math.floor(durationSec / 60);
            const secs = durationSec % 60;
            const durationText = `${mins}:${secs.toString().padStart(2, '0')}`;

            return {
                id: track.id ? String(track.id) : 'sc-' + Date.now(),
                title: track.name || track.title || 'SoundCloud Track',
                artist: track.user?.username || track.author?.name || 'SoundCloud',
                albumArt: track.thumbnail || track.artwork_url || '',
                uri: track.permalink || track.url || '',
                durationText: durationText,
                durationMs: durationMs,
                source: 'soundcloud'
            };
        } else {
            console.log(`[SoundCloud] No se encontraron canciones para: "${query}"`);
            return null;
        }
    } catch (err) {
        console.error('[SoundCloud] Error en searchSoundCloud:', err);
        const errMsg = err.message || '';
        if (errMsg.includes('ENOTFOUND') || errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONN') || errMsg.includes('fetch failed')) {
            if (typeof io !== 'undefined') {
                io.emit('system', { 
                    type: 'warning', 
                    message: '⚠️ Error de red con SoundCloud: Se detectó un bloqueo de conexión. Si estás en una red corporativa/de trabajo, el cortafuegos podría estar bloqueando SoundCloud. Intenta en tu WiFi de hogar.' 
                });
            }
        }
        return null;
    }
}



// Helper to strip emojis and symbols from names to prevent TTS from spelling them out
function stripEmojis(text) {
    if (typeof text !== 'string') return text;
    try {
        // Strip emoji presentation, symbols, pictographs, and all emojis
        return text.replace(/\p{Emoji_Presentation}/gu, '')
                   .replace(/\p{Emoji_Modifier_Base}/gu, '')
                   .replace(/\p{Emoji_Component}/gu, '')
                   .replace(/\p{Extended_Pictographic}/gu, '')
                   .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu, '')
                   .replace(/\s+/g, ' ')
                   .trim();
    } catch (e) {
        // Fallback to basic regex if Unicode properties fail
        return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{3297}\u{3299}\u{303D}\u{00A9}\u{00AE}\u{2122}\u{23E9}-\u{23EF}\u{23F0}\u{23F3}\u{23FA}\u{25B6}\u{25C0}]/gu, '')
                   .replace(/\s+/g, ' ')
                   .trim();
    }
}

// Helper to format custom phrases with smart fallbacks if the user omits {username} or {gift}/{count}
function formatCustomPhrase(phrase, eventType, displayName, giftName = "", count = 1) {
    if (!phrase || phrase.trim() === "") return "";
    
    let formatted = phrase;
    
    // Check if the phrase does NOT contain the username placeholder
    if (!formatted.toLowerCase().includes('{username}')) {
        // Automatically prepend "Gracias {username}: "
        formatted = `Gracias {username}: ${formatted}`;
    }
    
    if (eventType === 'gift') {
        // Check if {gift} or {count} is missing, and if so, append them naturally
        if (!formatted.toLowerCase().includes('{gift}') && !formatted.toLowerCase().includes('{count}')) {
            formatted = `${formatted} por {count} {gift}`;
        } else {
            if (!formatted.toLowerCase().includes('{gift}')) {
                formatted = `${formatted} ({gift})`;
            }
            if (!formatted.toLowerCase().includes('{count}')) {
                formatted = `${formatted} x{count}`;
            }
        }
    }
    
    // Perform standard replacements
    return formatted
        .replace(/{username}/g, displayName)
        .replace(/{gift}/g, giftName)
        .replace(/{count}/g, count);
}

try {
    const templateFile = path.join(__dirname, 'chatbot_settings.json');
    let templateSettings = {};
    if (fs.existsSync(templateFile)) {
        try {
            templateSettings = JSON.parse(fs.readFileSync(templateFile, 'utf-8'));
        } catch (e) {
            console.error('Error parsing template file chatbot_settings.json:', e);
        }
    }

    // On clean install, copy template file first if it exists
    if (!fs.existsSync(SETTINGS_FILE) && fs.existsSync(templateFile) && templateFile !== SETTINGS_FILE) {
        try {
            fs.copyFileSync(templateFile, SETTINGS_FILE);
            console.info('[Settings Loader] Copied template chatbot_settings.json to writable dir');
        } catch (copyErr) {
            console.error('[Settings Loader] Failed to copy template settings file:', copyErr);
        }
    }

    let loaded = {};
    let parseError = false;

    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            const rawContent = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            if (rawContent.trim() === '') {
                throw new Error('File is empty');
            }
            loaded = JSON.parse(rawContent);
        } catch (e) {
            console.error(`[Settings Loader] SETTINGS_FILE is empty or corrupt. Creating a backup...`, e);
            parseError = true;
            try {
                const backupPath = SETTINGS_FILE + '.bak';
                fs.copyFileSync(SETTINGS_FILE, backupPath);
                console.info(`[Settings Loader] Backup created at: ${backupPath}`);
            } catch (backupErr) {
                console.error(`[Settings Loader] Failed to create backup file:`, backupErr);
            }
        }
    }

    // Merge settings: defaults first, then template settings, then loaded settings
    if (!parseError) {
        chatbotSettings = { ...chatbotSettings, ...templateSettings, ...loaded };
        
        // Enforce structures and schemas
        if (!chatbotSettings.spotifyClientId || chatbotSettings.spotifyClientId.trim() === "") {
            chatbotSettings.spotifyClientId = templateSettings.spotifyClientId || "28b2a2ea9ff34b989b9b13fc7979691f";
        }
        if (!chatbotSettings.spotifyClientSecret || chatbotSettings.spotifyClientSecret.trim() === "") {
            chatbotSettings.spotifyClientSecret = templateSettings.spotifyClientSecret || "b2e0324ac37f4a6abef68319d285fda2";
        }
        
        chatbotSettings.spotifyVoteSkipLimit = parseInt(chatbotSettings.spotifyVoteSkipLimit) || 3;
        if (chatbotSettings.spotifyVoteSkipLimit < 1) chatbotSettings.spotifyVoteSkipLimit = 3;

        let settingsModified = false;
        if (!chatbotSettings.bannedWords || chatbotSettings.bannedWords.length === 0) {
            chatbotSettings.bannedWords = [...RECOMMENDED_BANNED_WORDS];
            settingsModified = true;
        }
        if (!chatbotSettings.bannedUsernames || chatbotSettings.bannedUsernames.length === 0) {
            chatbotSettings.bannedUsernames = [...RECOMMENDED_BANNED_WORDS];
            settingsModified = true;
        }

        if (chatbotSettings.filterEmojisFromNames === undefined) {
            chatbotSettings.filterEmojisFromNames = templateSettings.filterEmojisFromNames !== undefined ? templateSettings.filterEmojisFromNames : false;
        }
        if (chatbotSettings.thankYouGiftPhrase === undefined) {
            chatbotSettings.thankYouGiftPhrase = templateSettings.thankYouGiftPhrase || "";
        }
        if (chatbotSettings.thankYouFollowPhrase === undefined) {
            chatbotSettings.thankYouFollowPhrase = templateSettings.thankYouFollowPhrase || "";
        }
        if (chatbotSettings.thankYouSharePhrase === undefined) {
            chatbotSettings.thankYouSharePhrase = templateSettings.thankYouSharePhrase || "";
        }
        if (chatbotSettings.thankYouLikePhrase === undefined) {
            chatbotSettings.thankYouLikePhrase = templateSettings.thankYouLikePhrase || "";
        }
        if (chatbotSettings.bannerSlide1 === undefined) {
            chatbotSettings.bannerSlide1 = "Ejemplo de texto";
        }
        if (chatbotSettings.bannerSlide2 === undefined) {
            chatbotSettings.bannerSlide2 = "¡Pide tu canción en el chat usando !song! 🎵";
        }
        if (chatbotSettings.bannerSlide3 === undefined) {
            chatbotSettings.bannerSlide3 = "Meta de Regalos Activa (Calculada automáticamente)";
        }
        
        // Enforce sub-arrays
        chatbotSettings.goals = chatbotSettings.goals || [];
        let goalsModified = false;
        chatbotSettings.goals.forEach((goal, idx) => {
            if (goal && !goal.id) {
                goal.id = 'goal_' + Date.now() + '_' + idx;
                goalsModified = true;
            }
        });
        if (goalsModified || settingsModified) {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
        }
        chatbotSettings.wheelOptions = chatbotSettings.wheelOptions || ["5 Sentadillas", "Cantar un fragmento", "Contar un chiste", "Saludar como ardilla", "Omitir canción gratis", "Hacer una mueca graciosa"];
        chatbotSettings.soundAlerts = chatbotSettings.soundAlerts || [];
        chatbotSettings.customSounds = chatbotSettings.customSounds || [];
        
        chatbotSettings.globalWidgetStyles = chatbotSettings.globalWidgetStyles || {};
        chatbotSettings.globalWidgetStyles.bgOpacity = 0;
        chatbotSettings.globalWidgetStyles.borderColor = chatbotSettings.globalWidgetStyles.borderColor || "#00f0ff";
        
        chatbotSettings.widgets = chatbotSettings.widgets || {};
        for (const k in chatbotSettings.widgets) {
            if (chatbotSettings.widgets[k]) {
                delete chatbotSettings.widgets[k].bgOpacity;
                delete chatbotSettings.widgets[k].bgColor;
            }
        }
        
        chatbotSettings.socials = chatbotSettings.socials || [];
        chatbotSettings.socialsSettings = chatbotSettings.socialsSettings || { displayTime: 10, pauseTime: 2, enabled: true };
        chatbotSettings.bannerSettings = chatbotSettings.bannerSettings || {
            width: '100%',
            height: '80px',
            borderWidth: '2px',
            borderColor: '#ff0077',
            borderStyle: 'solid',
            borderRadius: '25px',
            backgroundColor: '#140a0f',
            backgroundOpacity: 45,
            fontFamily: 'Outfit',
            fontSize: '24px',
            fontColor: '#ffffff',
            rotationSpeed: 8,
            slides: [
                "Ejemplo de texto",
                "¡Pide tu canción en el chat usando !song 🎵",
                "Meta de Regalos Activa (Calculada automáticamente)"
            ]
        };
        
        // Ensure AI settings schema exists
        if (!chatbotSettings.ai) {
            chatbotSettings.ai = {
                naya: {
                    ai_bot_active: false,
                    ai_monetization_active: false,
                    ai_min_coins: 5,
                    ai_max_chars: 150,
                    ai_cooldown: 10,
                    ai_read_username: true,
                    ai_prompt_personality: "Habla como un chibi rosa tierno, dulce y alegre."
                },
                majo: {
                    ai_bot_active: false,
                    ai_monetization_active: false,
                    ai_min_coins: 10,
                    ai_max_chars: 150,
                    ai_cooldown: 10,
                    ai_read_username: true,
                    ai_prompt_personality: "Habla como Gojo de forma sarcástica, confiada y misteriosa con toques oscuros."
                }
            };
        } else {
            chatbotSettings.ai.naya = chatbotSettings.ai.naya || {};
            chatbotSettings.ai.naya.ai_bot_active = chatbotSettings.ai.naya.ai_bot_active !== undefined ? chatbotSettings.ai.naya.ai_bot_active : false;
            chatbotSettings.ai.naya.ai_monetization_active = chatbotSettings.ai.naya.ai_monetization_active !== undefined ? chatbotSettings.ai.naya.ai_monetization_active : false;
            chatbotSettings.ai.naya.ai_min_coins = chatbotSettings.ai.naya.ai_min_coins !== undefined ? chatbotSettings.ai.naya.ai_min_coins : 5;
            chatbotSettings.ai.naya.ai_max_chars = chatbotSettings.ai.naya.ai_max_chars !== undefined ? chatbotSettings.ai.naya.ai_max_chars : 150;
            chatbotSettings.ai.naya.ai_cooldown = chatbotSettings.ai.naya.ai_cooldown !== undefined ? chatbotSettings.ai.naya.ai_cooldown : 10;
            chatbotSettings.ai.naya.ai_read_username = chatbotSettings.ai.naya.ai_read_username !== undefined ? chatbotSettings.ai.naya.ai_read_username : true;
            chatbotSettings.ai.naya.ai_prompt_personality = chatbotSettings.ai.naya.ai_prompt_personality !== undefined ? chatbotSettings.ai.naya.ai_prompt_personality : "Habla como un chibi rosa tierno, dulce y alegre.";

            chatbotSettings.ai.majo = chatbotSettings.ai.majo || {};
            chatbotSettings.ai.majo.ai_bot_active = chatbotSettings.ai.majo.ai_bot_active !== undefined ? chatbotSettings.ai.majo.ai_bot_active : false;
            chatbotSettings.ai.majo.ai_monetization_active = chatbotSettings.ai.majo.ai_monetization_active !== undefined ? chatbotSettings.ai.majo.ai_monetization_active : false;
            chatbotSettings.ai.majo.ai_min_coins = chatbotSettings.ai.majo.ai_min_coins !== undefined ? chatbotSettings.ai.majo.ai_min_coins : 10;
            chatbotSettings.ai.majo.ai_max_chars = chatbotSettings.ai.majo.ai_max_chars !== undefined ? chatbotSettings.ai.majo.ai_max_chars : 150;
            chatbotSettings.ai.majo.ai_cooldown = chatbotSettings.ai.majo.ai_cooldown !== undefined ? chatbotSettings.ai.majo.ai_cooldown : 10;
            chatbotSettings.ai.majo.ai_read_username = chatbotSettings.ai.majo.ai_read_username !== undefined ? chatbotSettings.ai.majo.ai_read_username : true;
            chatbotSettings.ai.majo.ai_prompt_personality = chatbotSettings.ai.majo.ai_prompt_personality !== undefined ? chatbotSettings.ai.majo.ai_prompt_personality : "Habla como Gojo de forma sarcástica, confiada y misteriosa con toques oscuros.";
        }
        
        chatbotSettings.geminiApiKey = chatbotSettings.geminiApiKey || "";
        chatbotSettings.spotifySkipAllowedUsers = chatbotSettings.spotifySkipAllowedUsers || "";
        
        // Enforce apuestas structure
        chatbotSettings.apuestas = chatbotSettings.apuestas || {
            enabled: false,
            title: "¿Quién ganará hoy?",
            count: 4,
            p1: { name: "Participante 1", giftId: "8913", giftName: "Rosa", votes: 0, voters: [] },
            p2: { name: "Participante 2", giftId: "9947", giftName: "BFF Necklace", votes: 0, voters: [] },
            p3: { name: "Participante 3", giftId: "45", giftName: "Corazón", votes: 0, voters: [] },
            p4: { name: "Participante 4", giftId: "46", giftName: "Confeti", votes: 0, voters: [] }
        };
        // Safety checks for properties inside apuestas
        chatbotSettings.apuestas.enabled = chatbotSettings.apuestas.enabled !== undefined ? chatbotSettings.apuestas.enabled : false;
        chatbotSettings.apuestas.title = chatbotSettings.apuestas.title || "¿Quién ganará hoy?";
        chatbotSettings.apuestas.count = parseInt(chatbotSettings.apuestas.count) || 4;
        chatbotSettings.apuestas.p1 = chatbotSettings.apuestas.p1 || { name: "Participante 1", giftId: "8913", giftName: "Rosa", votes: 0, voters: [] };
        chatbotSettings.apuestas.p2 = chatbotSettings.apuestas.p2 || { name: "Participante 2", giftId: "9947", giftName: "BFF Necklace", votes: 0, voters: [] };
        chatbotSettings.apuestas.p3 = chatbotSettings.apuestas.p3 || { name: "Participante 3", giftId: "45", giftName: "Corazón", votes: 0, voters: [] };
        chatbotSettings.apuestas.p4 = chatbotSettings.apuestas.p4 || { name: "Participante 4", giftId: "46", giftName: "Confeti", votes: 0, voters: [] };

        if (chatbotSettings.apuestas.p1 && chatbotSettings.apuestas.p1.name === "Naya") {
            chatbotSettings.apuestas.p1.name = "Participante 1";
        }
        if (chatbotSettings.apuestas.p2 && chatbotSettings.apuestas.p2.name === "Majo") {
            chatbotSettings.apuestas.p2.name = "Participante 2";
        }

        // Ensure voters array and votes exists for each participant
        ['p1', 'p2', 'p3', 'p4'].forEach(pKey => {
            if (chatbotSettings.apuestas[pKey]) {
                chatbotSettings.apuestas[pKey].voters = chatbotSettings.apuestas[pKey].voters || [];
                chatbotSettings.apuestas[pKey].votes = parseInt(chatbotSettings.apuestas[pKey].votes) || 0;
            }
        });

        // Always write final merged schema to ensure all keys are physically present
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
    } else {
        // Enforce safe memory settings from default + template
        chatbotSettings = { ...chatbotSettings, ...templateSettings };
        chatbotSettings.bannerSlide1 = chatbotSettings.bannerSlide1 || "Ejemplo de texto";
        chatbotSettings.bannerSlide2 = chatbotSettings.bannerSlide2 || "¡Pide tu canción en el chat usando !song 🎵";
        chatbotSettings.bannerSlide3 = chatbotSettings.bannerSlide3 || "Meta de Regalos Activa (Calculada automáticamente)";
        chatbotSettings.goals = chatbotSettings.goals || [];
        chatbotSettings.wheelOptions = chatbotSettings.wheelOptions || ["5 Sentadillas", "Cantar un fragmento", "Contar un chiste", "Saludar como ardilla", "Omitir canción gratis", "Hacer una mueca graciosa"];
        chatbotSettings.widgets = chatbotSettings.widgets || {};
        chatbotSettings.widgets.spotify  = chatbotSettings.widgets.spotify  || { active: true,  x: 80, y: 10 };
        chatbotSettings.widgets.donors   = chatbotSettings.widgets.donors   || { active: true,  x: 5,  y: 30 };
        chatbotSettings.widgets.taps     = chatbotSettings.widgets.taps     || { active: true,  x: 5,  y: 55 };
        chatbotSettings.widgets.mvp      = chatbotSettings.widgets.mvp      || { active: true,  x: 5,  y: 80 };
        chatbotSettings.widgets.songlist = chatbotSettings.widgets.songlist || { active: true,  x: 55, y: 80 };
        chatbotSettings.widgets.banner   = chatbotSettings.widgets.banner   || { active: true,  x: 0,  y: 0, width: 100, height: 10 };
        chatbotSettings.widgets.socialRotator = chatbotSettings.widgets.socialRotator || { active: true, x: 35, y: 85 };
        
        chatbotSettings.socials = chatbotSettings.socials || [];
        chatbotSettings.socialsSettings = chatbotSettings.socialsSettings || { displayTime: 10, pauseTime: 2, enabled: true };
    }
} catch (err) {
    console.error('Error loading chatbot settings:', err);
}

let soundsConfig = {};
try {
    soundsConfig = readJsonFileSafe(SOUNDS_CONFIG_FILE, {});
    if (!fs.existsSync(SOUNDS_CONFIG_FILE)) {
        writeJsonFileSafe(SOUNDS_CONFIG_FILE, soundsConfig);
    }
} catch (err) {
    console.error('Error loading sounds_config.json:', err);
}

// ============================================================
// CATÁLOGO ESPEJO: goals_catalog.json
// Copia del cerebro (gifts_mapping.json) usada exclusivamente
// como picker de regalos en el módulo Dinámicas.
// Solo recibe nuevas entradas cuando el cerebro registra
// un regalo nuevo. Nunca contiene metas activas.
// ============================================================
let goalsCatalog = {};
try {
    let brainData = readJsonFileSafe(GIFTS_MAPPING_FILE, {});
    goalsCatalog = readJsonFileSafe(GOALS_CATALOG_FILE, {});
    
    let updated = false;
    if (Object.keys(goalsCatalog).length === 0) {
        // First run or empty catalog: build goals catalog from brain
        Object.entries(brainData).forEach(([gid, gdata]) => {
            goalsCatalog[gid] = { name: gdata.name, coins: gdata.coins, image: gdata.image };
        });
        updated = true;
        console.info('[Goals Catalog] goals_catalog.json inicializado desde el cerebro con', Object.keys(goalsCatalog).length, 'regalos.');
    } else {
        // Sync any new brain entries not yet in goals catalog
        Object.entries(brainData).forEach(([gid, gdata]) => {
            if (!goalsCatalog[gid]) {
                goalsCatalog[gid] = { name: gdata.name, coins: gdata.coins, image: gdata.image };
                updated = true;
            }
        });
    }
    if (updated) {
        writeJsonFileSafe(GOALS_CATALOG_FILE, goalsCatalog);
    }
} catch (err) {
    console.error('Error loading/creating goals_catalog.json:', err);
}

/**
 * syncMirrorCatalogs — llama al registrar un nuevo regalo en el cerebro.
 * Propaga el nuevo regalo al catálogo espejo de Dinámicas (goals_catalog.json).
 * NO toca sounds_config.json (multimedia maneja eso de forma independiente).
 */
function syncMirrorCatalogs(giftId, giftData) {
    // Solo goals_catalog recibe la sincronización automática del cerebro.
    // Multimedia agrega regalos manualmente a través del modal de selección.
    if (!goalsCatalog[giftId]) {
        goalsCatalog[giftId] = {
            name: giftData.name,
            coins: giftData.coins,
            image: giftData.image
        };
        try {
            writeJsonFileSafe(GOALS_CATALOG_FILE, goalsCatalog);
            console.info(`[Sync Espejo] Nuevo regalo propagado a goals_catalog: ${giftData.name} (ID: ${giftId})`);
        } catch (err) {
            console.error('Error sync goals_catalog.json:', err);
        }
    }
}

let recetasConfig = {
    title: "RECETA DEL DÍA: PASTEL DE FRESAS",
    items: [
        { name: "Fresas Frescas 10 tazas" },
        { name: "Harina de Trigo 300g" },
        { name: "Azúcar Morena 150g" },
        { name: "Esencia de Vainilla 2 cdas" }
    ],
    visible: true
};
try {
    recetasConfig = readJsonFileSafe(RECETAS_CONFIG_FILE, recetasConfig);
    if (!fs.existsSync(RECETAS_CONFIG_FILE)) {
        writeJsonFileSafe(RECETAS_CONFIG_FILE, recetasConfig);
    }
} catch (err) {
    console.error('Error loading recetas_config.json:', err);
}

let dinamicasConfig = [];
try {
    dinamicasConfig = readJsonFileSafe(DINAMICAS_CONFIG_FILE, []);
    if (!fs.existsSync(DINAMICAS_CONFIG_FILE)) {
        writeJsonFileSafe(DINAMICAS_CONFIG_FILE, dinamicasConfig);
    }
} catch (err) {
    console.error('Error loading dinamicas_config.json:', err);
}

// Load last connected profile configuration if exists
try {
    if (chatbotSettings.tiktokUsername) {
        loadProfile(chatbotSettings.tiktokUsername);
    }
} catch (err) {
    console.error('Error loading profile at startup:', err);
}



// In-memory sets and caches for TTS chatbot
let quieremeAllowedUsers = new Set();
let lastQuieremeResetDate = new Date().toDateString();
const userSpamCache = {};

// Helper to clean username for TTS reading (removing numbers, underscores, dots)
function cleanUsernameForReading(name) {
    if (!name) return 'usuario';
    let clean = stripEmojis(name);
    // Remove trailing numbers (e.g. user123 -> user)
    clean = clean.replace(/\d+$/, '');
    // Replace underscores, dashes, dots with space
    clean = clean.replace(/[-_.]/g, ' ').trim();
    if (!clean || clean.length < 2) {
        clean = stripEmojis(name).trim();
    }
    if (!clean) {
        clean = 'usuario';
    }
    return clean;
}

// Helper to sanitize AI and chat text for TTS audio reading (removing markdown, brackets, emojis, special characters)
function sanitizeTextForTts(text) {
    if (!text) return '';
    return text
        .replace(/[*_`~#]/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]/gu, '')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Helper to normalize common chat abbreviations in Spanish
function normalizeChatAbbreviations(text) {
    if (!text) return '';
    let words = text.split(/\s+/);
    const abbrevMap = {
        'pq': 'porque',
        'q': 'que',
        'k': 'que',
        'tb': 'también',
        'tmb': 'también',
        'grx': 'gracias',
        'grs': 'gracias',
        'ty': 'gracias',
        'gpi': 'gracias por invitar',
        'dts': 'datos',
        'xd': 'equis de',
        'tqm': 'te quiero mucho',
        'x2': 'por dos'
    };
    
    return words.map(word => {
        const cleanWord = word.toLowerCase().replace(/[^a-zñáéíóú]/g, '');
        if (abbrevMap[cleanWord]) {
            return word.toLowerCase().replace(cleanWord, abbrevMap[cleanWord]);
        }
        return word;
    }).join(' ');
}

// Reduce repeated letters (e.g. holaaaaa -> holaa)
function reduceRepeatedLetters(text) {
    if (!text) return '';
    return text.replace(/([a-zA-ZáéíóúÁÉÍÓÚñÑ])\1{2,}/g, '$1$1');
}

// Banned words detector using word boundaries (prevents false positives like "en la noche" -> "ano")
function isBannedText(text, isUsername = false) {
    if (!text) return false;
    
    // Normalize to handle accents, but preserve spaces for word boundary checking
    let normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    const wordList = isUsername 
        ? (chatbotSettings.bannedUsernames || chatbotSettings.bannedWords || [])
        : (chatbotSettings.bannedWords || []);
        
    const banned = wordList.map(w => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()).filter(w => w.length > 0);
    
    for (const word of banned) {
        // Escape any regex special characters in the banned word
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Use word boundaries \b to ensure it matches whole words only
        const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
        
        if (regex.test(normalized)) {
            return true;
        }
    }
    return false;
}

// Helper to replace text-based emojis with friendly Spanish words
function replaceTextEmojis(text) {
    if (!text) return "";
    let cleanText = text;

    const emojiMap = {
        "laught_cry": "risas",
        "laugh_cry": "risas",
        "laught cry": "risas",
        "laugh cry": "risas",
        "laugh": "risa",
        "laught": "risa",
        "funny": "gracioso",
        "lol": "carcajadas",
        "cry": "llanto",
        "crying": "llorando",
        "sad": "triste",
        "heart": "corazón",
        "love": "corazón",
        "kiss": "beso",
        "kisses": "besos",
        "wink": "guiño",
        "blink": "guiño",
        "complacent": "satisfecho",
        "cute": "tierno",
        "shock": "sorpresa",
        "stunned": "asombrado",
        "slap": "bofetada",
        "rage": "enojo",
        "angry": "enojado",
        "cool": "lentes de sol",
        "thinking": "pensando",
        "sweat": "sudor",
        "yawn": "bostezo",
        "rose": "rosa",
        "gift": "regalo",
        "crown": "corona",
        "fire": "fuego",
        "applause": "aplausos",
        "clap": "aplausos",
        "thumbsup": "me gusta",
        "like": "me gusta"
    };

    // Replace bracketed ones like [laugh_cry] or [rose]
    cleanText = cleanText.replace(/\[([^\]]+)\]/g, (match, p1) => {
        const key = p1.toLowerCase().trim().replace(/_/g, " ");
        if (emojiMap[key]) return emojiMap[key];
        const keyWithUnderscores = p1.toLowerCase().trim();
        if (emojiMap[keyWithUnderscores]) return emojiMap[keyWithUnderscores];
        return p1; // Preserve unmapped text (like [Naya] -> Naya)
    });

    // Replace colon ones like :laugh_cry: or :rose:
    cleanText = cleanText.replace(/:([^:]+):/g, (match, p1) => {
        const key = p1.toLowerCase().trim().replace(/_/g, " ");
        if (emojiMap[key]) return emojiMap[key];
        const keyWithUnderscores = p1.toLowerCase().trim();
        if (emojiMap[keyWithUnderscores]) return emojiMap[keyWithUnderscores];
        return p1; // Preserve unmapped
    });

    // Replace raw phrases like "laught cry" or "laugh_cry" if they appear as standalone words
    for (const [key, value] of Object.entries(emojiMap)) {
        const regex = new RegExp(`\\b${key}\\b`, 'gi');
        cleanText = cleanText.replace(regex, value);
    }

    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    return cleanText;
}

// Helper to generate cloud TTS audio
// Entry point for chat comments. Implements Rate Limiter and Queue to prevent TTS spam.
async function handleCloudTTS(data) {
    if (!chatbotSettings) return;
    if (chatbotSettings.ttsEngine !== 'cloud' && chatbotSettings.ttsEngine !== 'gemini') return;
    
    const uniqueId = (data.uniqueId || '').toLowerCase();
    const nickname = data.nickname || data.uniqueId || '';
    const isVipUser = (uniqueId === 'tavorj');

    // Ignore all chat comment readings if permission is set to none (No leer a ninguno / Solo alertas)
    if (chatbotSettings.permission === 'none' && !isVipUser) return;

    // 1. Username filter (moderation)
    if (isBannedText(uniqueId, true) || isBannedText(nickname, true)) {
        console.warn(`[TTS Moderación] Omitiendo mensaje de usuario bloqueado por nombre vulgar: @${uniqueId}`);
        return;
    }

    // 2. Anti-spam (repetitive comments check)
    const commentNorm = (data.comment || '').trim().toLowerCase();
    const now = Date.now();
    if (userSpamCache[uniqueId] && !isVipUser) {
        const cache = userSpamCache[uniqueId];
        if (cache.lastComment === commentNorm && (now - cache.lastTime < 60000)) {
            console.info(`[TTS Spam Shield] Ignorando comentario duplicado de @${uniqueId} ("${commentNorm}")`);
            return;
        }
    }
    // Update cache
    userSpamCache[uniqueId] = {
        lastComment: commentNorm,
        lastTime: now
    };
    
    // 3. Sliding window rate limiter (3 messages per second globally triggers High Flow Mode)
    const nowTimestamp = Date.now();
    ttsMessageTimestamps.push(nowTimestamp);
    ttsMessageTimestamps = ttsMessageTimestamps.filter(t => nowTimestamp - t < 1000);
    const isHighFlowMode = ttsMessageTimestamps.length > 3;

    const isExclusiveUser = isVipUser || (chatbotSettings.exclusiveTtsEnabled && 
                            chatbotSettings.exclusiveTtsUser && 
                            uniqueId === chatbotSettings.exclusiveTtsUser.toLowerCase().trim());

    // If chatbot is inactive, ONLY allow exclusive user / VIP user (@tavorj)
    if (!chatbotSettings.active) {
        if (!isExclusiveUser) return;
    }

    // If exclusive user mode is enabled, ONLY read from this user
    if (chatbotSettings.exclusiveTtsEnabled) {
        if (!isExclusiveUser) return;
    }

    // User permissions & badges
    const isAnchor = (data.userIdentity && typeof data.userIdentity.isAnchor !== 'undefined')
        ? data.userIdentity.isAnchor
        : (uniqueId === chatbotSettings.tiktokUsername.toLowerCase());
        
    const isModerator = isAnchor || ((data.userIdentity && typeof data.userIdentity.isModeratorOfAnchor !== 'undefined')
        ? data.userIdentity.isModeratorOfAnchor
        : !!data.isModerator);
        
    const isSubscriber = isAnchor || ((data.userIdentity && typeof data.userIdentity.isSubscriberOfAnchor !== 'undefined')
        ? data.userIdentity.isSubscriberOfAnchor
        : !!data.isSubscriber);

    const gifterLevel = data.gifterLevel || (data.badgeAttributes && data.badgeAttributes.gifterLevel) || 0;
    const isDonor = gifterLevel >= 5;

    let comment = data.comment || '';
    const isCommand = comment.trim().startsWith('!') || (chatbotSettings.prefixes || ['.', '/']).some(p => comment.trim().startsWith(p));

    // Under High Flow Mode, drop messages from standard users (VIP user @tavorj is exempt)
    if (isHighFlowMode && !isVipUser) {
        if (!isSubscriber && !isModerator && !isAnchor && !isDonor && !isCommand) {
            console.log(`[TTS Spam Shield] High Flow Mode active (${ttsMessageTimestamps.length} msg/s). Dropping message from @${data.uniqueId}`);
            return;
        }
    }

    // Determine priority
    const isPriority = isSubscriber || isModerator || isAnchor || isDonor || isCommand || isExclusiveUser || isVipUser;

    // Enqueue the TTS generation task (VIP user @tavorj gets inserted at the absolute front)
    if (isVipUser) {
        console.info(`[TTS Priority VIP] @tavorj envió mensaje: "${comment}". Insertando con máxima prioridad.`);
        ttsQueue.unshift({
            data,
            isPriority: true,
            isVip: true,
            timestamp: now
        });
    } else {
        ttsQueue.push({
            data,
            isPriority,
            timestamp: now
        });
    }

    // Limit queue size to 5 elements maximum to prevent latency accumulation > 1000ms
    while (ttsQueue.length > 5) {
        const oldestNonPriorityIdx = ttsQueue.findIndex(task => !task.isPriority);
        if (oldestNonPriorityIdx !== -1) {
            console.info(`[TTS Spam Shield] Queue exceeded limit. Purging oldest non-priority TTS task.`);
            ttsQueue.splice(oldestNonPriorityIdx, 1);
        } else {
            console.info(`[TTS Spam Shield] Queue exceeded limit. Purging oldest priority task to protect latency.`);
            ttsQueue.shift(); // Drop the oldest priority task if queue is full of priorities
        }
    }

    // Process the queue
    processTtsQueue();
}

// Process the async queue of TTS tasks sequentially
async function processTtsQueue() {
    if (isProcessingTts) return;
    if (ttsQueue.length === 0) return;

    isProcessingTts = true;
    const currentTask = ttsQueue.shift();

    try {
        await generateAndPlayTTS(currentTask.data);
    } catch (err) {
        console.error('[TTS Queue] Error generating/playing voice buffer:', err);
    } finally {
        isProcessingTts = false;
        // Proceed to next message with a brief gap to prevent CPU blocking
        setTimeout(processTtsQueue, 50);
    }
}

// Low-level voice generation using Microsoft Edge neural translation service
async function generateAndPlayTTS(data) {
    const uniqueId = (data.uniqueId || '').toLowerCase();
    
    const isAnchor = (data.userIdentity && typeof data.userIdentity.isAnchor !== 'undefined')
        ? data.userIdentity.isAnchor
        : (uniqueId === chatbotSettings.tiktokUsername.toLowerCase());
        
    const isModerator = isAnchor || ((data.userIdentity && typeof data.userIdentity.isModeratorOfAnchor !== 'undefined')
        ? data.userIdentity.isModeratorOfAnchor
        : !!data.isModerator);
        
    const isSubscriber = isAnchor || ((data.userIdentity && typeof data.userIdentity.isSubscriberOfAnchor !== 'undefined')
        ? data.userIdentity.isSubscriberOfAnchor
        : !!data.isSubscriber);
    const nickname = data.nickname || data.uniqueId || 'Usuario';
    let comment = data.comment || '';
    
    const isVipUser = (uniqueId === 'tavorj');

    // 1. Blacklist & Banned Username check (bypassed for @tavorj)
    const blacklist = (chatbotSettings.ignoreUserList || []).map(u => u.toLowerCase().trim());
    if (!isVipUser) {
        if (blacklist.includes(uniqueId)) return;
        if (isBannedText(uniqueId, true) || isBannedText(nickname, true)) {
            console.warn(`[TTS Moderación] Omitiendo lectura de TTS de @${uniqueId} por nombre vulgar.`);
            return;
        }
    }
    
    // 2. Reset Quiéreme set if day has changed (Midnight check)
    const currentDate = new Date().toDateString();
    if (currentDate !== lastQuieremeResetDate) {
        quieremeAllowedUsers.clear();
        lastQuieremeResetDate = currentDate;
        console.info("[Quiereme Reset] Midnight reset of allowed users list.");
    }
    
    // 3. Permission check (with Quiéreme & VIP @tavorj bypass)
    const userRole = chatbotSettings.permission || 'all';
    const isQuieremeAllowed = quieremeAllowedUsers.has(uniqueId);
    
    if (!data.isAiResponse && !isQuieremeAllowed && !isVipUser) {
        if (userRole === 'mods' && !isModerator && !isAnchor) return;
        if (userRole === 'subs' && !isSubscriber && !isModerator && !isAnchor) return;
        if (userRole === 'quiereme' && !isModerator && !isAnchor) return;
    }
    
    // 4. Prefix command check (VIP @tavorj bypasses prefix requirement)
    if (!data.isAiResponse && chatbotSettings.readPrefixRequired && !isVipUser) {
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
    
    // 5. Character filtering (block rare languages)
    if (chatbotSettings.blockRareLanguages) {
        const disallowedRegex = /[\u0900-\u097F\u0600-\u06FF\u0400-\u04FF\u4e00-\u9fa5]/;
        if (disallowedRegex.test(comment)) return;
    }
    
    // 6. Clean emojis and replace text mappings
    comment = comment.replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/gu, '');
    comment = replaceTextEmojis(comment);
    
    // Slang normalizer & repeated letters compressor
    comment = normalizeChatAbbreviations(comment);
    comment = reduceRepeatedLetters(comment);
    
    if (!comment.trim()) return;
    
    // 7. Custom Blocked Words check (Skip for AI since Gemini is safe, avoids false positives)
    if (!data.isAiResponse && isBannedText(comment)) {
        if (chatbotSettings.bannedWordsAction === 'skip') {
            return;
        } else {
            const banned = (chatbotSettings.bannedWords || []).map(w => w.toLowerCase().trim()).filter(w => w.length > 0);
            for (const word of banned) {
                const censorRegex = new RegExp(word, 'gi');
                comment = comment.replace(censorRegex, '***');
            }
        }
    }
    
    // 8. Limit length
    if (!data.isAiResponse) {
        const maxChars = parseInt(chatbotSettings.maxCharacters ?? 150);
        if (comment.length > maxChars) {
            comment = comment.substring(0, maxChars) + '...';
        }
    }
    
    // 9. Username reading format (clean username)
    let textToSpeak = comment;
    if (!data.isAiResponse && chatbotSettings.readUsername) {
        const displayName = cleanUsernameForReading(nickname);
        textToSpeak = `${displayName} dice: ${comment}`;
    }
    
    // 9. Determine voice settings
    let voiceName = 'es-CO-SalomeNeural';
    if (chatbotSettings.ttsEngine === 'gemini') {
        voiceName = chatbotSettings.geminiVoiceName || 'Aoede';
    } else {
        voiceName = chatbotSettings.cloudVoiceName || 'es-CO-SalomeNeural';
    }
    let volume = chatbotSettings.volume ?? 1;
    let pitch = chatbotSettings.pitch ?? 1;
    let rate = chatbotSettings.rate ?? 1;
    let customStyle = null; // Will override global geminiStyleInstructions if set
    
    if (data.isAiResponse) {
        const themeName = chatbotSettings.themeName || 'neutral';
        const aiProfile = themeName === 'majo' ? 'majo' : 'naya';
        const aiConfig = (chatbotSettings.ai && chatbotSettings.ai[aiProfile]) || {};
        if (aiConfig.ai_voice_name && aiConfig.ai_voice_name !== 'default') {
            voiceName = aiConfig.ai_voice_name;
        }
        if (aiConfig.ai_voice_style) {
            customStyle = aiConfig.ai_voice_style;
        }
    } else {
        const userVoiceRule = (chatbotSettings.userVoices || []).find(v => v.username.toLowerCase() === uniqueId);
        if (userVoiceRule) {
            voiceName = userVoiceRule.voice;
            volume = userVoiceRule.volume ?? 1;
            pitch = userVoiceRule.pitch ?? 1;
            rate = userVoiceRule.rate ?? 1;
            if (userVoiceRule.style) {
                customStyle = userVoiceRule.style;
            }
        }
    }
    
    const tempFile = path.join(writableDir, `temp_tts_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp3`);
    
    // Rate formatting
    const ratePercentage = Math.round((rate - 1) * 100);
    const rateStr = ratePercentage >= 0 ? `+${ratePercentage}%` : `${ratePercentage}%`;
    
    // Pitch formatting
    const pitchPercentage = Math.round((pitch - 1) * 50);
    const pitchStr = pitchPercentage >= 0 ? `+${pitchPercentage}Hz` : `${pitchPercentage}Hz`;

    try {
        await synthesizeSpeech(textToSpeak, voiceName, rateStr, pitchStr, tempFile, customStyle);
        
        if (fs.existsSync(tempFile)) {
            let audioBuffer = fs.readFileSync(tempFile);
            let base64Audio = audioBuffer.toString('base64');
            
            const isAiResponse = !!data.isAiResponse || (uniqueId === 'ia') || (uniqueId === 'gemini_ai');
            const displayName = isAiResponse ? 'IA Asistente' : (data.nickname || data.uniqueId || 'Usuario');
            
            io.emit('play_tts_audio', {
                base64Audio,
                playLocation: 'panel',
                username: displayName,
                uniqueId: uniqueId,
                isAI: isAiResponse,
                comment: data.comment || '',
                isModerator,
                isSubscriber
            });
            
            fs.unlinkSync(tempFile);
            
            // Clear references immediately to free RAM
            audioBuffer = null;
            base64Audio = null;
            if (global.gc) {
                try { global.gc(); } catch (e) {}
            }
        }
    } catch (error) {
        console.error('Error generating Edge/Gemini TTS:', error);
        // Inform user in real-time about the generation failure (e.g. 429 Rate Limit, Quota)
        io.emit('system', { type: 'error', message: `Fallo de TTS: ${error.message}` });
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
            if (response.ok) {
                // Force play/resume after skipping native track
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
    emitMonetizedUsersUpdate(true);
    console.info(`Agregado a la cola: ${track.title} - ${track.artist} (Pedido por @${track.requester})`);
    
    if (spotifyQueue.length === 1 && (!currentSpotifyTrack || !currentSpotifyTrack.isPlaying)) {
        playNextInQueue();
    }
}

function handleVoteSkip(requester, isStaff) {
    // !skip SIEMPRE requiere votos para TODOS (incluyendo moderadores)
    // Los moderadores pueden usar !skipforce o !skipsong para saltar sin votos
    
    if (!currentSpotifyTrack || !currentSpotifyTrack.isPlaying) {
        return;
    }
    
    if (spotifyVoteSkips.has(requester)) {
        io.emit('system', { type: 'warning', message: `@${requester} ya votó para omitir esta canción.` });
        return;
    }
    
    spotifyVoteSkips.add(requester);
    const votesNeeded = chatbotSettings.spotifyVoteSkipLimit || 3;
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
            // Limpiar query de operadores de búsqueda (como el guion "-" y el signo "+") que causan problemas de exclusión en Spotify
            const cleanQuery = query.replace(/[-+]/g, ' ').trim();
            console.log(`Buscando pistas para query limpio: "${cleanQuery}"`);
            const trackSearch = await searchSpotify(cleanQuery, 'track', 5);
            if (trackSearch && trackSearch.tracks && trackSearch.tracks.items.length > 0) {
                const tracks = trackSearch.tracks.items;
                let allowedTracks = tracks;
                if (!chatbotSettings.spotifyExplicitAllowed) {
                    allowedTracks = tracks.filter(t => !t.explicit);
                }
                
                if (allowedTracks.length > 0) {
                    const tracksWithScores = allowedTracks.map(track => ({
                        track,
                        score: scoreTrack(track, cleanQuery)
                    }));
                    
                    // Ordenar por puntaje descendente y usar la popularidad como desempate
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

function getMonetizedUsersData() {
    const minCoins = chatbotSettings.spotifyMinCoins || 5;
    const monetizedUsers = [];
    
    for (const [userId, coins] of Object.entries(sessionGiftCoins)) {
        if (coins >= minCoins) {
            monetizedUsers.push({
                userId: userId,
                totalCoins: coins,
                creditsAvailable: Math.floor(coins / minCoins),
                nickname: userId // Will be enriched with actual nickname if stored
            });
        }
    }
    
    // Sort by coins in descending order
    return monetizedUsers.sort((a, b) => b.totalCoins - a.totalCoins);
}

function emitMonetizedUsersUpdate() {
    const users = getMonetizedUsersData();
    io.emit('spotify_monetized_users_updated', users);
}

// Function to emit AI queue updates to frontend
function emitAiQueueUpdate() {
    io.emit('ai_queue_updated', aiCommandQueue);
}

// Check the AI queue every second
setInterval(async () => {
    if (isAiProcessing || aiCommandQueue.length === 0) return;
    
    // Check global cooldown
    const themeName = chatbotSettings?.themeName || 'neutral';
    const aiProfile = themeName === 'majo' ? 'majo' : 'naya';
    const aiConfig = (chatbotSettings?.ai && chatbotSettings.ai[aiProfile]) || {};
    const cooldownMs = (aiConfig.ai_cooldown || 10) * 1000;
    
    if (Date.now() - lastAiCallTime < cooldownMs) return;

    // Pop the next item
    const item = aiCommandQueue.shift();
    emitAiQueueUpdate();
    
    if (item) {
        await executeAiCommand(item);
    }
}, 1000);

async function handleAiChatCommand(data) {
    if (!chatbotSettings) return;

    const themeName = chatbotSettings.themeName || 'neutral';
    const aiProfile = themeName === 'majo' ? 'majo' : 'naya';
    const aiConfig = (chatbotSettings.ai && chatbotSettings.ai[aiProfile]) || {};

    if (!aiConfig.ai_bot_active) return;

    const commandPrefix = (aiConfig.ai_command_prefix || '!ia').toLowerCase().trim() + ' ';
    const comment = (data.comment || '').trim();
    if (!comment.toLowerCase().startsWith(commandPrefix)) return;

    const prompt = comment.substring(commandPrefix.length).trim();
    if (!prompt) return;

    const uniqueId = (data.uniqueId || '').toLowerCase().trim();
    const nickname = data.nickname || data.uniqueId;

    // Check monetization for chat commands
    if (aiConfig.ai_monetization_active) {
        const credits = userAiCredits[uniqueId] || 0;
        if (credits < 1) {
            console.warn(`[AI Gemini] @${uniqueId} intentó usar la IA sin créditos.`);
            io.emit('system', { 
                type: 'warning', 
                message: `@${nickname} necesita créditos de IA. Envía regalos para ganar créditos (Mínimo: ${aiConfig.ai_min_coins} monedas).` 
            });
            return;
        }
        // Deduct 1 credit
        userAiCredits[uniqueId] = credits - 1;
        io.emit('system', { 
            type: 'info', 
            message: `@${nickname} usó 1 crédito de IA. Créditos restantes: ${userAiCredits[uniqueId]}` 
        });
    }

    const charLimit = parseInt(aiConfig.ai_max_chars) || 150;

    // Add to queue
    aiQueueCounter++;
    aiCommandQueue.push({
        id: `ai_${Date.now()}_${aiQueueCounter}`,
        uniqueId,
        nickname,
        prompt,
        comment,
        isAutoGift: false
    });
    
    console.info(`[AI Gemini] Petición de @${uniqueId} añadida a la cola. Posición: ${aiCommandQueue.length}`);
    io.emit('system', { type: 'info', message: `IA encolada para @${nickname} (Posición ${aiCommandQueue.length})` });
    
    // Emit detailed log event for RAW Event Scanner (lines moradas)
    io.emit('tiktok_event_raw', {
        eventType: 'ai_question',
        data: {
            uniqueId,
            nickname,
            prompt,
            comment,
            charLimit,
            position: aiCommandQueue.length
        }
    });

    emitAiQueueUpdate();
}

function truncateAiResponse(rawResponseText, charLimit) {
    let clean = (rawResponseText || '')
        .replace(/[\r\n]+/g, ' ')           // collapse line breaks
        .replace(/[*_`~#]/g, '')             // strip markdown
        .replace(/\d+\.\s+/g, '')            // strip numbered list prefixes like "1. "
        .replace(/-\s+(?=[A-ZÁÉÍÓÚa-záéíóú])/g, '')  // strip bullet dashes
        .replace(/\s+/g, ' ')                // collapse whitespace
        .trim();

    if (clean.length <= charLimit) {
        clean = clean.replace(/\s+$/, '');
        if (!/[.!?]$/.test(clean)) {
            clean += ".";
        }
        return clean;
    }

    // Snippet up to charLimit
    const snippet = clean.substring(0, charLimit);

    // Find the last complete sentence punctuation (. ! ?) within snippet
    const lastPunctuation = Math.max(
        snippet.lastIndexOf('.'),
        snippet.lastIndexOf('?'),
        snippet.lastIndexOf('!')
    );

    // If a sentence punctuation exists and offers a valid sentence (at least 15 chars)
    if (lastPunctuation >= 15) {
        clean = snippet.substring(0, lastPunctuation + 1).trim();
    } else {
        // Cut at last word boundary to avoid cutting mid-word
        const lastSpace = snippet.lastIndexOf(' ');
        if (lastSpace > 10) {
            clean = snippet.substring(0, lastSpace).trim();
        } else {
            clean = snippet.trim();
        }
    }

    clean = clean.replace(/\s+$/, '');
    if (!/[.!?]$/.test(clean)) {
        clean += ".";
    }

    return clean;
}

let cachedGeminiModel = null;
let lastModelCheckTime = 0;

async function getBestGeminiModel(apiKey) {
    if (cachedGeminiModel && (Date.now() - lastModelCheckTime < 300000)) {
        return cachedGeminiModel;
    }

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
            signal: AbortSignal.timeout(8000)
        });

        if (res.ok) {
            const data = await res.json();
            if (data.models && Array.isArray(data.models)) {
                const validModels = data.models
                    .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => m.name.replace(/^models\//, ''));

                console.info('[AI Gemini] Modelos autorizados en tu clave de Google AI Studio:', validModels);

                const priorities = [
                    'gemini-2.0-flash',
                    'gemini-2.5-flash',
                    'gemini-1.5-flash-latest',
                    'gemini-1.5-flash',
                    'gemini-1.5-flash-8b',
                    'gemini-1.5-pro-latest',
                    'gemini-1.5-pro',
                    'gemini-pro'
                ];

                for (const prio of priorities) {
                    if (validModels.includes(prio)) {
                        cachedGeminiModel = prio;
                        lastModelCheckTime = Date.now();
                        return prio;
                    }
                }

                if (validModels.length > 0) {
                    cachedGeminiModel = validModels[0];
                    lastModelCheckTime = Date.now();
                    return validModels[0];
                }
            }
        } else {
            const errText = await res.text();
            console.warn(`[AI Gemini] ListModels devolvió HTTP ${res.status}: ${errText}`);
        }
    } catch (e) {
        console.warn(`[AI Gemini] Advertencia al consultar modelos de Gemini: ${e.message}`);
    }

    return 'gemini-1.5-flash-latest';
}

async function executeAiCommand(item) {
    if (!chatbotSettings) return;
    
    isAiProcessing = true;
    
    const themeName = chatbotSettings.themeName || 'neutral';
    const aiProfile = themeName === 'majo' ? 'majo' : 'naya';
    const aiConfig = (chatbotSettings.ai && chatbotSettings.ai[aiProfile]) || {};

    const uniqueId = item.uniqueId;
    const nickname = item.nickname;
    const prompt = item.prompt;

    const apiKey = (aiConfig.gemini_api_key || chatbotSettings.geminiApiKey || chatbotSettings.gemini_api_key || '').trim();
    if (!apiKey || apiKey.trim() === "") {
        console.error("[AI Gemini] Error: Gemini API Key no configurada.");
        io.emit('system', { type: 'error', message: 'ERROR: API Key de Gemini no configurada en los ajustes.' });
        io.emit('tiktok_event_raw', {
            eventType: 'ai_error',
            data: { uniqueId, nickname, error: 'API Key de Gemini no configurada.' }
        });
        
        if (!item.isAutoGift && aiConfig.ai_monetization_active) {
            userAiCredits[uniqueId] = (userAiCredits[uniqueId] || 0) + 1;
        }
        isAiProcessing = false;
        return;
    }

    console.log('[GEMINI AUTH] Usando Key que termina en:', apiKey.slice(-6));

    // Set last call time
    lastAiCallTime = Date.now();

    const charLimit = parseInt(aiConfig.ai_max_chars) || 150;

    // Build system prompt: personality + behavioral rules for natural brevity without character counting meta-text
    const personalityBase = aiConfig.ai_prompt_personality || "Eres un asistente divertido y amable para una transmisión en vivo de TikTok.";
    const approxWords = Math.max(10, Math.floor(charLimit / 6));
    const systemPrompt = `${personalityBase}

Reglas obligatorias:
- Responde SIEMPRE en español latino, en un tono natural, directo y fluido.
- Mantén tu respuesta concisa (LÍMITE ESTRICTO: MÁXIMO ${charLimit} CARACTERES TOTALES, aproximadamente ${approxWords} palabras).
- NUNCA incluyas conteos de caracteres, ni notas entre paréntesis sobre la longitud de tu respuesta.
- Escribe en un solo texto continuo sin saltos de línea, viñetas, listas ni formato markdown (sin asteriscos, sin hashtags, sin emojis).
- Termina siempre con una oración completa finalizada en punto (.), signo de interrogación (?) o exclamación (!).`;

    try {
        // Multi-turn conversation window buffer (max 8 turns)
        aiChatHistory.push({ role: 'user', parts: [{ text: prompt }] });
        if (aiChatHistory.length > 8) {
            aiChatHistory = aiChatHistory.slice(-8);
        }

        // FASE 1: Modelos de texto fijados (Primario: gemini-2.0-flash | Fallback: gemini-1.5-flash)
        const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash'];
        let response = null;
        let lastErrorText = '';
        let chosenModel = '';

        for (const modelName of modelsToTry) {
            try {
                console.log(`[GEMINI REQUEST] Key: ...${apiKey.slice(-6)} | Modelo: ${modelName}`);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: aiChatHistory,
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        generationConfig: {
                            maxOutputTokens: 300,
                            temperature: 0.7
                        }
                    }),
                    signal: AbortSignal.timeout(12000)
                });

                if (response.ok) {
                    chosenModel = modelName;
                    console.info(`[AI Gemini] FASE 1: Respuesta generada exitosamente con el modelo '${chosenModel}' para @${uniqueId}`);
                    break;
                }
                lastErrorText = await response.text();
                console.warn(`[AI Gemini] Intento FASE 1 con ${modelName} devolvió HTTP ${response.status}: ${lastErrorText}`);
            } catch (fetchErr) {
                lastErrorText = fetchErr.message;
                console.warn(`[AI Gemini] Error FASE 1 al conectar con ${modelName}: ${fetchErr.message}`);
            }
        }

        if (!response || !response.ok) {
            let errorMsg = `Gemini API Error: ${lastErrorText || 'No se pudo conectar con el motor de texto de Gemini'}`;
            try {
                const parsed = JSON.parse(lastErrorText);
                if (parsed.error && parsed.error.message) {
                    errorMsg = `Gemini API Error (${response ? response.status : '404'}): ${parsed.error.message}`;
                }
            } catch(e) {}
            throw new Error(errorMsg);
        }

        io.emit('tiktok_event_raw', {
            eventType: 'ai_processing',
            data: { uniqueId, nickname, prompt, charLimit, modelUsed: chosenModel }
        });

        const result = await response.json();
        let rawResponseText = "";
        if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts[0]) {
            rawResponseText = result.candidates[0].content.parts[0].text || "";
        }

        const finishReason = result.candidates && result.candidates[0] && result.candidates[0].finishReason;
        console.log(`[AI Gemini] finishReason: ${finishReason}`);

        rawResponseText = rawResponseText.trim();
        if (!rawResponseText) {
            console.warn("[AI Gemini] Respuesta vacía de Gemini.");
            io.emit('tiktok_event_raw', {
                eventType: 'ai_error',
                data: { uniqueId, nickname, error: 'Gemini devolvió una respuesta vacía.' }
            });
            isAiProcessing = false;
            return;
        }

        // Apply sentence-aware clean truncation
        const finalCleanText = truncateAiResponse(rawResponseText, charLimit);

        // Diagnostic log
        console.log('╔══════════════════════════════════════════════');
        console.log('║ TAVLIVE IA DEBUG');
        console.log('╠══════════════════════════════════════════════');
        console.log('║ USER:', `@${uniqueId}`);
        console.log('║ INPUT:', prompt);
        console.log('║ RAW GEMINI (' + rawResponseText.length + ' chars):', rawResponseText);
        console.log('║ FINAL (' + finalCleanText.length + ' chars):', finalCleanText);
        console.log('║ CHAR LIMIT:', charLimit);
        console.log('║ FINISH REASON:', finishReason);
        console.log('╚══════════════════════════════════════════════');

        io.emit('tiktok_event_raw', {
            eventType: 'ai_response',
            data: {
                uniqueId,
                nickname,
                comment: finalCleanText,
                rawLength: rawResponseText.length,
                finalLength: finalCleanText.length,
                charLimit: charLimit,
                finishReason: finishReason
            }
        });

        let spokenText = finalCleanText;
        if (aiConfig.ai_read_username) {
            spokenText = `Respondiendo a ${cleanUsernameForReading(nickname)}, ${finalCleanText}`;
        }
        spokenText = sanitizeTextForTts(spokenText);

        ttsQueue.push({
            data: {
                uniqueId: "gemini_ai",
                nickname: "Gemini",
                comment: spokenText,
                isAiResponse: true
            },
            isPriority: true,
            timestamp: Date.now()
        });
        processTtsQueue();

    } catch (err) {
        console.error('[AI Gemini] Error al llamar a Gemini:', err);
        io.emit('system', { type: 'error', message: `Error en la IA: ${err.message}` });
        io.emit('tiktok_event_raw', {
            eventType: 'ai_error',
            data: { uniqueId, nickname, error: err.message }
        });
        
        if (!item.isAutoGift && aiConfig.ai_monetization_active) {
            userAiCredits[uniqueId] = (userAiCredits[uniqueId] || 0) + 1;
        }
    }
    
    isAiProcessing = false;
}

async function handleSpotifyChatCommand(data) {
    if (!chatbotSettings.spotifyConnected || !chatbotSettings.spotifyEnabled || !chatbotSettings.spotifyChatQueueEnabled) {
        return;
    }

    const comment = (data.comment || '').trim();
    const uniqueId = data.uniqueId;
    const nickname = data.nickname || uniqueId;
    
    const isAnchor = (data.userIdentity && typeof data.userIdentity.isAnchor !== 'undefined')
        ? data.userIdentity.isAnchor
        : (uniqueId && chatbotSettings.tiktokUsername && uniqueId.toLowerCase() === chatbotSettings.tiktokUsername.toLowerCase());
        
    const isModerator = isAnchor || ((data.userIdentity && typeof data.userIdentity.isModeratorOfAnchor !== 'undefined')
        ? data.userIdentity.isModeratorOfAnchor
        : !!data.isModerator);
        
    const isSubscriber = isAnchor || ((data.userIdentity && typeof data.userIdentity.isSubscriberOfAnchor !== 'undefined')
        ? data.userIdentity.isSubscriberOfAnchor
        : !!data.isSubscriber);
    
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
            
            // Monetization credit check
            if (chatbotSettings.spotifyMonetizationEnabled) {
                if (!isModerator && !isAnchor) {
                    const minCoins = chatbotSettings.spotifyMinCoins || 5;
                    const sessionCoins = sessionGiftCoins[uniqueId.toLowerCase()] || 0;
                    const credits = userMusicCredits[uniqueId.toLowerCase()] || 0;
                    const hasPermission = (sessionCoins >= minCoins) || (credits >= 1);
                    
                    if (!hasPermission) {
                        io.emit('system', { 
                            type: 'warning', 
                            message: `@${uniqueId} no tiene permiso para pedir canción. Requiere enviar un regalo de al menos ${minCoins} monedas.` 
                        });
                        return;
                    }
                    
                    // Deduct credit (prefer session coins first)
                    if (sessionCoins >= minCoins) {
                        sessionGiftCoins[uniqueId.toLowerCase()] -= minCoins;
                        io.emit('system', { 
                            type: 'info', 
                            message: `@${uniqueId} usó ${minCoins} monedas de regalos para pedir canción. Monedas restantes en sesión: ${sessionGiftCoins[uniqueId.toLowerCase()]}` 
                        });
                    } else if (credits >= 1) {
                        userMusicCredits[uniqueId.toLowerCase()] = credits - 1;
                        io.emit('system', { 
                            type: 'info', 
                            message: `@${uniqueId} usó 1 crédito de música. Créditos restantes: ${userMusicCredits[uniqueId.toLowerCase()]}` 
                        });
                    }
                }
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
        const allowedUsers = (chatbotSettings.spotifySkipAllowedUsers || '')
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

async function refreshSpotifyToken() {
    const clientId = chatbotSettings.spotifyClientId || '28b2a2ea9ff34b989b9b13fc7979691f';
    const clientSecret = chatbotSettings.spotifyClientSecret || 'b2e0324ac37f4a6abef68319d285fda2';
    
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
let lastPollUri = null;
let currentActiveQueueTrack = null;
let lastEmittedTrackUri = null;
let lastEmittedIsPlaying = null;

setInterval(async () => {
    if (chatbotSettings.spotifyConnected && chatbotSettings.spotifyEnabled) {
        try {
            const track = await getSpotifyCurrentlyPlaying();
            if (track) {
                // Si empezó una nueva canción (URL cambió en comparación con el último sondeo)
                if (track.spotifyUrl !== lastPollUri) {
                    lastTriggeredUri = null;
                    lastPollUri = track.spotifyUrl;
                    spotifyVoteSkips.clear();
                    io.emit('spotify_votes_updated', { votes: 0, limit: chatbotSettings.spotifyVoteSkipLimit });
                }

                // Si la canción está sonando y restan menos de 5 segundos
                if (track.isPlaying && track.durationMs && track.progressMs !== undefined) {
                    const remainingTime = track.durationMs - track.progressMs;
                    if (remainingTime <= 5000 && track.spotifyUrl !== lastTriggeredUri) {
                        console.log(`Finalización de track detectada (Restan: ${remainingTime}ms). Reproduciendo siguiente en cola...`);
                        lastTriggeredUri = track.spotifyUrl;
                        playNextInQueue();
                    }
                }

                currentSpotifyTrack = track;
                
                // Agregar el requester si esta canción proviene de nuestra cola
                if (currentActiveQueueTrack && (track.title === currentActiveQueueTrack.title || track.spotifyUrl === currentActiveQueueTrack.uri)) {
                    track.requester = currentActiveQueueTrack.requester;
                } else if (currentActiveQueueTrack && track.spotifyUrl !== currentActiveQueueTrack.uri) {
                    currentActiveQueueTrack = null;
                }
                
                // Emitir spotify_track ÚNICAMENTE cuando la canción cambia o cambia el estado de reproducción (play/pause)
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



const app = express();
const server = http.createServer(app);
io = new Server(server, {
    pingInterval: 25000,
    pingTimeout: 60000,
    maxHttpBufferSize: 1e8
});

let remoteConfig = {};

async function loadRemoteConfig() {
    try {
        console.log('Obteniendo configuración remota desde GitHub...');
        const res = await fetch('https://raw.githubusercontent.com/TavoRJ/Tiktok-control/main/remote_config.json');
        if (res.ok) {
            const data = await res.json();
            remoteConfig = { ...remoteConfig, ...data };
            console.log('Configuración remota cargada con éxito:', remoteConfig);
            io.emit('remote_config_updated', remoteConfig);
        } else {
            console.warn(`Respuesta no exitosa al cargar config remota (${res.status}). Usando valores por defecto.`);
        }
    } catch (err) {
        console.error('Error al cargar la configuración remota:', err);
    }
}

// Middleware to parse JSON payloads (for base64 uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = 3000;
const TIKTOK_USERNAME = 'nayamorningstar';

// =========================================================================
// TAVLIVE LOCAL AUTHENTICATION LOCK STATE (FASE 2)
// =========================================================================
let localAuthState = {
    isAuthed: false,
    user: null,
    license: null,
    accessToken: null,
    lastVerifiedAt: null
};

const REMOTE_AUTH_SERVER = process.env.REMOTE_AUTH_SERVER || 'http://127.0.0.1:4000';

const PLAN_WEIGHTS = {
    'FREE': 1,
    'PRO': 2,
    'VIP': 3
};

/**
 * Feature Gating Middleware for Local server.js Routes
 * Enforces tier authorization based on remotely validated license state.
 */
function requirePlan(minPlan) {
    return (req, res, next) => {
        if (!localAuthState.isAuthed || !localAuthState.user) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'Authentication required'
            });
        }

        const userPlan = (localAuthState.license && localAuthState.license.plan) ? localAuthState.license.plan : 'FREE';
        const licenseStatus = localAuthState.license ? localAuthState.license.status : 'active';
        const expiresAt = localAuthState.license ? localAuthState.license.expires_at : null;
        const isExpiredByDate = expiresAt && (new Date(expiresAt).getTime() < Date.now());

        if (licenseStatus === 'revoked' || licenseStatus === 'paused' || licenseStatus === 'expired' || isExpiredByDate) {
            return res.status(403).json({
                success: false,
                error: 'LICENSE_INVALID',
                message: `License is ${isExpiredByDate ? 'expired' : licenseStatus}`
            });
        }

        const userWeight = PLAN_WEIGHTS[userPlan] || 1;
        const minWeight = PLAN_WEIGHTS[minPlan] || 1;

        if (userWeight < minWeight) {
            return res.status(403).json({
                success: false,
                error: 'PLAN_UPGRADE_REQUIRED',
                message: `Plan ${minPlan} required`
            });
        }

        next();
    };
}

function getRemoteAuthServer() {
    return process.env.REMOTE_AUTH_SERVER || 'https://tavlive-auth-server.onrender.com';
}

// API: Set internal auth session from client
app.post('/api/internal/set-auth-session', async (req, res) => {
    try {
        const { accessToken, user } = req.body;
        if (!accessToken) {
            localAuthState = { isAuthed: false, user: null, license: null, accessToken: null };
            return res.status(400).json({ success: false, error: 'Access token required.' });
        }

        // Validate token remotely with Remote Auth Server
        const verifyRes = await fetch(`${getRemoteAuthServer()}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }).catch(err => ({ ok: false, status: 0 }));

        if (!verifyRes.ok) {
            const isJson = verifyRes.headers && typeof verifyRes.headers.get === 'function' && (verifyRes.headers.get('content-type') || '').includes('application/json');
            const errData = (isJson && typeof verifyRes.json === 'function') ? await verifyRes.json().catch(() => ({})) : {};
            if (verifyRes.status === 403) {
                localAuthState = {
                    isAuthed: true,
                    user: user || { id: 'blocked', email: 'blocked@user.com' },
                    license: { plan: 'FREE', status: 'expired' },
                    accessToken,
                    lastVerifiedAt: Date.now()
                };
                return res.status(403).json({ success: false, error: errData.error || 'License invalid or expired.' });
            }

            localAuthState = { isAuthed: false, user: null, license: null, accessToken: null };
            io.emit('auth_state_changed', { isAuthed: false });
            return res.status(401).json({ success: false, error: 'Remote token validation failed.' });
        }

        const verifyData = await verifyRes.json();
        if (!verifyData.success || !verifyData.user) {
            localAuthState = { isAuthed: false, user: null, license: null, accessToken: null };
            io.emit('auth_state_changed', { isAuthed: false });
            return res.status(401).json({ success: false, error: 'Invalid user state.' });
        }

        localAuthState = {
            isAuthed: true,
            user: verifyData.user,
            license: verifyData.license || { plan: 'FREE', status: 'active' },
            accessToken,
            lastVerifiedAt: Date.now()
        };

        console.info(`[TavLive Auth] Local server unlocked for user: ${verifyData.user.email} [Plan: ${localAuthState.license.plan}]`);
        io.emit('auth_state_changed', { isAuthed: true, user: localAuthState.user, license: localAuthState.license });

        res.json({ success: true, isAuthed: true, user: localAuthState.user, license: localAuthState.license });
    } catch (err) {
        console.error('[TavLive Auth] Error setting local auth session:', err);
        localAuthState = { isAuthed: false, user: null, license: null, accessToken: null };
        res.status(500).json({ success: false, error: 'Internal auth error.' });
    }
});

// API: Clear internal auth session (Logout)
app.post('/api/internal/clear-auth-session', (req, res) => {
    localAuthState = { isAuthed: false, user: null, license: null, accessToken: null };
    if (typeof tiktokLiveConnection !== 'undefined' && tiktokLiveConnection) {
        try {
            tiktokLiveConnection.removeAllListeners();
            tiktokLiveConnection.disconnect();
        } catch (e) {}
        tiktokLiveConnection = null;
    }
    console.info('[TavLive Auth] Local server locked (Logged out).');
    io.emit('auth_state_changed', { isAuthed: false });
    res.json({ success: true });
});

// API: Check internal auth status
app.get('/api/internal/auth-status', (req, res) => {
    res.json({ isAuthed: localAuthState.isAuthed, user: localAuthState.user, license: localAuthState.license });
});

// Ensure upload directory exists in writable directory
const UPLOADS_DIR = path.join(writableDir, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Middleware to isolate host assets dynamically and prevent brand leakage
app.use((req, res, next) => {
    const url = req.url.toLowerCase();
    const theme = chatbotSettings.themeName || 'neutral';
    
    if (url.includes('/assets/')) {
        if (url === '/assets/gift' || url === '/assets/gift/') {
            console.warn(`[Asset Isolation] Access blocked to gifts directory index: ${req.url}`);
            return res.status(404).send('Not Found');
        }
        if (url.includes('naya') && theme !== 'naya') {
            console.warn(`[Asset Isolation] Redirection blocked: client tried accessing Naya assets under active theme '${theme}'`);
            return res.status(404).send('Not Found');
        }
        if (url.includes('majo') && theme !== 'majo') {
            console.warn(`[Asset Isolation] Redirection blocked: client tried accessing Majo assets under active theme '${theme}'`);
            return res.status(404).send('Not Found');
        }
    }
    next();
});

// Serve static files from the 'public' directory with anti-cache headers
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));

// Serve temporary files from the writable directory
app.use(express.static(writableDir));

// Serve uploads from the writable directory
app.use('/uploads', express.static(UPLOADS_DIR));

// ──────────────────────────────────────────────────────────────────────────────
// Servir imágenes de regalos con coincidencia inteligente (fuzzy match)
// Estrategia: 1) Exacto → 2) Case-insensitive → 3) Normalizado (espacio=guión)
// Esto resuelve el mismatch entre nombres en gifts_mapping (ej. ari_radiante.png)
// y los archivos reales en la carpeta (ej. "Ari Radiante.png")
// ──────────────────────────────────────────────────────────────────────────────
const GIFT_ASSETS_DIR = path.join(__dirname, 'public', 'assets', 'gift');
let _giftFileCache = null; // Cache para evitar leer el directorio en cada request

function getGiftFiles() {
    if (!_giftFileCache) {
        try {
            _giftFileCache = fs.readdirSync(GIFT_ASSETS_DIR);
        } catch (e) {
            _giftFileCache = [];
        }
    }
    return _giftFileCache;
}

// Invalidar cache cuando se agrega un nuevo archivo (si aplica)
function invalidateGiftCache() { _giftFileCache = null; }

app.get('/gift-assets/:filename', (req, res) => {
    const requested = decodeURIComponent(req.params.filename);
    
    // 1. Try to load from custom gifts directory in %appdata% Roaming first
    const customGiftsDir = path.join(writableDir, 'gifts');
    if (!fs.existsSync(customGiftsDir)) {
        try { fs.mkdirSync(customGiftsDir, { recursive: true }); } catch (e) {}
    }
    
    try {
        if (fs.existsSync(customGiftsDir)) {
            const customFiles = fs.readdirSync(customGiftsDir);
            
            // A. Exact match in custom
            if (customFiles.includes(requested)) {
                return res.sendFile(path.join(customGiftsDir, requested));
            }
            
            // B. Case-insensitive match in custom
            const lowerReq = requested.toLowerCase();
            const customCiMatch = customFiles.find(f => f.toLowerCase() === lowerReq);
            if (customCiMatch) {
                return res.sendFile(path.join(customGiftsDir, customCiMatch));
            }
            
            // C. Normalized match in custom
            const normalize = str => str.toLowerCase().replace(/[\s_]+/g, '').replace(/['']/g, '');
            const customNormMatch = customFiles.find(f => normalize(f.replace(/\.png$/i, '')) === normalize(requested.replace(/\.png$/i, '')));
            if (customNormMatch) {
                return res.sendFile(path.join(customGiftsDir, customNormMatch));
            }
        }
    } catch (e) {
        console.error('[Gifts Fallback] Error checking custom gifts folder:', e);
    }

    // 2. Fallback to default packaged assets
    const files = getGiftFiles();

    // A. Exact match in default
    if (files.includes(requested)) {
        return res.sendFile(path.join(GIFT_ASSETS_DIR, requested));
    }

    // B. Case-insensitive match in default
    const lowerReq = requested.toLowerCase();
    const ciMatch = files.find(f => f.toLowerCase() === lowerReq);
    if (ciMatch) {
        return res.sendFile(path.join(GIFT_ASSETS_DIR, ciMatch));
    }

    // C. Normalized match in default
    const normalize = str => str.toLowerCase().replace(/[\s_]+/g, '').replace(/['']/g, '');
    const normMatch = files.find(f => normalize(f.replace(/\.png$/i, '')) === normalize(requested.replace(/\.png$/i, '')));
    if (normMatch) {
        return res.sendFile(path.join(GIFT_ASSETS_DIR, normMatch));
    }

    // 4. Not found
    res.status(404).end();
});

// Serve streamer assets
app.use('/streamer-assets', express.static(path.join(__dirname, 'public', 'assets', 'streamers')));

// Serve app icon assets
app.use('/app-assets', express.static(path.join(__dirname, 'public', 'assets', 'app-icons')));

// Serve sound assets
app.use('/sound-assets', express.static(path.join(__dirname, 'public', 'sounds')));
app.use('/sound-assets', express.static(UPLOADS_DIR));

// Basic route for the control panel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for the overlay
app.get('/overlay', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// Route for isolated recetas widget
app.get('/recetas', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'recetas.html'));
});

// Route for isolated dinamicas widget
app.get('/dinamicas', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dinamicas.html'));
});

// Route for isolated animations overlay (shared for quiereme, glove, x2, levelup)
app.get('/animations', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'animations.html'));
});

// Route for dedicated custom uploaded animations overlay
app.get('/custom-animations', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'custom-animations.html'));
});

// Route for isolated social rotator widget
app.get('/social-rotator', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'social-rotator.html'));
});

// Route for isolated TTS & IA soundwave visualizer widget
app.get('/tts-widget', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tts-widget.html'));
});

// Route for Spotify Authorization Redirect
app.get('/spotify-login', (req, res) => {
    const clientId = chatbotSettings.spotifyClientId || '28b2a2ea9ff34b989b9b13fc7979691f';
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
    
    const clientId = chatbotSettings.spotifyClientId || '28b2a2ea9ff34b989b9b13fc7979691f';
    const clientSecret = chatbotSettings.spotifyClientSecret || 'b2e0324ac37f4a6abef68319d285fda2';
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

// Middleware to close connections and prevent caching on dynamic API requests
app.use('/api', (req, res, next) => {
    res.setHeader('Connection', 'close');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    next();
});

// API: Get active application version
app.get('/api/version', (req, res) => {
    res.json({ version: packageJson.version });
});

// API: Stream audio locally to bypass CORS and rights blocks
app.get('/api/stream-audio', requirePlan('VIP'), (req, res) => {
    const streamUrl = req.query.url;
    if (!streamUrl) {
        return res.status(400).send('Missing url parameter');
    }
    
    const https = require('https');
    const http = require('http');
    const urlModule = require('url');

    function proxyAudioStream(targetUrl, clientReq, clientRes, redirectCount = 0) {
        if (redirectCount > 5) {
            console.error('[Audio Proxy] Demasiados redireccionamientos para:', targetUrl);
            return clientRes.status(500).send('Too many redirects');
        }

        try {
            const parsedUrl = urlModule.parse(targetUrl);
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            };
            
            // Forward Range header if present
            if (clientReq.headers['range']) {
                headers['range'] = clientReq.headers['range'];
            }

            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path: parsedUrl.path,
                method: 'GET',
                headers: headers,
                rejectUnauthorized: false
            };

            console.log(`[Audio Proxy] Intentando conectar (intento ${redirectCount}): ${targetUrl.substring(0, 80)}...`);

            const lib = parsedUrl.protocol === 'https:' ? https : http;
            const proxyReq = lib.get(options, (proxyRes) => {
                // Handle redirect status codes (301, 302, 303, 307, 308)
                if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                    const redirectUrl = urlModule.resolve(targetUrl, proxyRes.headers.location);
                    return proxyAudioStream(redirectUrl, clientReq, clientRes, redirectCount + 1);
                }

                // Copy content-related headers or force them if missing
                let contentType = proxyRes.headers['content-type'] || 'audio/mpeg';
                if (contentType.toLowerCase() === 'application/octet-stream') {
                    contentType = 'audio/mpeg';
                }
                
                clientRes.setHeader('Content-Type', contentType);
                clientRes.setHeader('Access-Control-Allow-Origin', '*');

                if (proxyRes.headers['content-length']) {
                    clientRes.setHeader('Content-Length', proxyRes.headers['content-length']);
                }
                if (proxyRes.headers['accept-ranges']) {
                    clientRes.setHeader('Accept-Ranges', proxyRes.headers['accept-ranges']);
                }
                if (proxyRes.headers['content-range']) {
                    clientRes.setHeader('Content-Range', proxyRes.headers['content-range']);
                }

                clientRes.statusCode = proxyRes.statusCode || 200;
                proxyRes.pipe(clientRes);
            });

            proxyReq.on('error', (err) => {
                console.error('[Audio Proxy] Request error:', err);
                if (!clientRes.headersSent) {
                    clientRes.status(500).send('Error fetching stream');
                }
            });
        } catch (err) {
            console.error('[Audio Proxy] Parsing error:', err);
            if (!clientRes.headersSent) {
                clientRes.status(500).send('Error processing proxy request');
            }
        }
    }

    proxyAudioStream(streamUrl, req, res);
});

// API: Get Custom Animations
app.get('/api/custom-animations', (req, res) => {
    res.json(chatbotSettings.customAnimations || []);
});

// API: Get Active Assets dynamically based on active theme
app.get('/api/active-assets', (req, res) => {
    const theme = chatbotSettings.themeName || 'neutral';
    
    const assets = {
        naya: {
            logo: `http://127.0.0.1:${PORT}/streamer-assets/naya-logo.png`,
            shadow: '0 0 15px rgba(255, 105, 180, 0.4)',
            accentColor: '#ff0077',
            backgroundColor: '#fff0f5',
            spotifyColor: '#ff69b4',
            youtubeColor: '#ff0055'
        },
        majo: {
            logo: `http://127.0.0.1:${PORT}/streamer-assets/majo-logo2.png`,
            shadow: '0 0 15px rgba(157, 78, 221, 0.4)',
            accentColor: '#9d4edd',
            backgroundColor: '#1e1b29',
            spotifyColor: '#b5179e',
            youtubeColor: '#7209b7'
        },
        neutral: {
            logo: `http://127.0.0.1:${PORT}/app-assets/neutral-logo.jpg`,
            shadow: '0 0 15px rgba(0, 217, 255, 0.4)',
            accentColor: '#00d9ff',
            backgroundColor: '#0f172a',
            spotifyColor: '#1db954',
            youtubeColor: '#ff0000'
        }
    };
    
    res.json(assets[theme] || assets.neutral);
});

// API: Get System Sounds dynamically from public/sounds and UPLOADS_DIR (custom uploaded sounds)
app.get('/api/system-sounds', (req, res) => {
    const defaultSoundsDir = path.join(__dirname, 'public', 'sounds');
    const customSoundsDir = UPLOADS_DIR;
    
    const allFiles = new Set();
    const soundObjects = [];
    
    // 1. Scan default sounds
    if (fs.existsSync(defaultSoundsDir)) {
        try {
            const files = fs.readdirSync(defaultSoundsDir);
            files.forEach(file => {
                if (file.endsWith('.mp3') || file.endsWith('.wav')) {
                    allFiles.add(file.toLowerCase());
                    let friendlyName = file.replace(/\.(mp3|wav)$/i, '').replace(/[-_]/g, ' ');
                    friendlyName = friendlyName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    soundObjects.push({
                        name: friendlyName,
                        url: `/sounds/${file}`,
                        filename: file
                    });
                }
            });
        } catch (e) {
            console.error('Error scanning default sounds:', e);
        }
    }
    
    // 2. Scan custom uploaded sounds
    if (fs.existsSync(customSoundsDir)) {
        try {
            const files = fs.readdirSync(customSoundsDir);
            files.forEach(file => {
                if ((file.endsWith('.mp3') || file.endsWith('.wav')) && !allFiles.has(file.toLowerCase())) {
                    allFiles.add(file.toLowerCase());
                    let friendlyName = file.replace(/\.(mp3|wav)$/i, '').replace(/[-_]/g, ' ');
                    friendlyName = friendlyName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    soundObjects.push({
                        name: friendlyName + ' (Custom)',
                        url: `/uploads/${file}`,
                        filename: file
                    });
                }
            });
        } catch (e) {
            console.error('Error scanning custom sounds:', e);
        }
    }
    
    soundObjects.sort((a, b) => a.name.localeCompare(b.name));
    res.json(soundObjects);
});

// API: Get gifts catalog (read-only from gifts_mapping.json / CEREBRO)
app.get('/api/get-gifts', (req, res) => {
    try {
        if (fs.existsSync(GIFTS_MAPPING_FILE)) {
            const data = JSON.parse(fs.readFileSync(GIFTS_MAPPING_FILE, 'utf8'));
            res.json(data);
        } else {
            res.json({});
        }
    } catch (e) {
        console.error('[API /api/get-gifts] Error reading gifts_mapping.json:', e);
        res.json({});
    }
});

// PUENTE DE RESPALDO: Para asegurar que el buscador de metas no falle si llama a /api/gifts
app.get('/api/gifts', (req, res) => {
    try {
        if (fs.existsSync(GIFTS_MAPPING_FILE)) {
            const data = JSON.parse(fs.readFileSync(GIFTS_MAPPING_FILE, 'utf8'));
            res.json(data);
        } else {
            res.json({});
        }
    } catch (e) {
        res.json({});
    }
});

// API: Catálogo espejo de Dinámicas — picker de regalos para metas
// Solo lectura. Siempre sincronizado con gifts_mapping.json (el cerebro).
app.get('/api/goals-catalog', (req, res) => {
    try {
        res.json(goalsCatalog);
    } catch (e) {
        res.json({});
    }
});

// API: Upload Custom Animation (Base64)
app.post('/api/custom-animations', requirePlan('PRO'), (req, res) => {
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

        // Clear references immediately to free RAM
        buffer = null;
        if (req.body) {
            delete req.body.fileData;
        }

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
app.delete('/api/custom-animations/:id', requirePlan('PRO'), (req, res) => {
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

// API: Upload Custom Sound (Base64)
app.post('/api/upload-sound', requirePlan('PRO'), (req, res) => {
    try {
        const { filename, fileData } = req.body;
        if (!filename || !fileData) {
            return res.status(400).json({ error: 'Faltan campos requeridos (filename, fileData)' });
        }

        // Decode base64 data
        const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let buffer;
        if (matches && matches.length === 3) {
            buffer = Buffer.from(matches[2], 'base64');
        } else {
            buffer = Buffer.from(fileData, 'base64');
        }

        const cleanName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = path.join(UPLOADS_DIR, cleanName);
        fs.writeFileSync(filePath, buffer);

        // Clear references immediately to free RAM
        buffer = null;
        if (req.body) {
            delete req.body.fileData;
        }

        res.json({ success: true, sound: { filename: cleanName } });
    } catch (err) {
        console.error('Error uploading sound:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Delete Custom Sound
app.delete('/api/upload-sound/:id', requirePlan('PRO'), (req, res) => {
    try {
        const { id } = req.params;
        if (!chatbotSettings.customSounds) {
            chatbotSettings.customSounds = [];
        }

        const soundIdx = chatbotSettings.customSounds.findIndex(s => s.id === id);
        if (soundIdx === -1) {
            return res.status(404).json({ error: 'Sonido no encontrado' });
        }

        const sound = chatbotSettings.customSounds[soundIdx];
        const filePath = path.join(UPLOADS_DIR, sound.filename);

        // Safely remove file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Remove from list
        chatbotSettings.customSounds.splice(soundIdx, 1);

        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
        io.emit('chatbot_settings_updated', chatbotSettings);

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting sound:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Upload Master Animation Custom Override
app.post('/api/master-animations/:key', requirePlan('PRO'), (req, res) => {
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

        // Clear references immediately to free RAM
        buffer = null;
        if (req.body) {
            delete req.body.fileData;
        }

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
app.delete('/api/master-animations/:key', requirePlan('PRO'), (req, res) => {
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
app.post('/api/mvps', requirePlan('VIP'), (req, res) => {
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
app.put('/api/mvps/:username/toggle', requirePlan('VIP'), (req, res) => {
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
app.delete('/api/mvps/:username', requirePlan('VIP'), (req, res) => {
    try {
        const user = req.params.username.toLowerCase();
        if (chatbotSettings.mvpEntrances) {
            chatbotSettings.mvpEntrances = chatbotSettings.mvpEntrances.filter(
                m => m.username.toLowerCase() !== user
            );
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting MVP mapping:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Delete Goal
app.delete('/api/goals/:id', (req, res) => {
    try {
        const goalId = req.params.id;
        if (chatbotSettings.goals) {
            const initialLength = chatbotSettings.goals.length;
            chatbotSettings.goals = chatbotSettings.goals.filter(g => g && g.id && g.id !== goalId);
            
            if (chatbotSettings.goals.length < initialLength) {
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
                io.emit('goals_updated', chatbotSettings.goals);
                io.emit('chatbot_settings_updated', chatbotSettings);
                
                // Also emit meta_goal_updated for active goal in case the active goal was deleted
                const activeGoal = chatbotSettings.goals.find(g => g.type === 'gift' && g.enabled);
                if (activeGoal) {
                    io.emit('meta_goal_updated', {
                        giftName: activeGoal.giftName,
                        current: activeGoal.current,
                        target: activeGoal.target
                    });
                } else {
                    io.emit('meta_goal_updated', null);
                }
                
                return res.json({ success: true, goals: chatbotSettings.goals });
            }
        }
        res.status(404).json({ error: 'Meta no encontrada o ID inválido' });
    } catch (err) {
        console.error('Error deleting goal:', err);
        res.status(500).json({ error: err.message });
    }
});

// Route for Music Overlay Widget
app.get('/music-widget', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'music-widget.html'));
});



// API: Connect TikTok LIVE with License Username Binding (Subphase 8A)
app.post('/api/tiktok/connect', (req, res) => {
    if (!localAuthState.isAuthed) {
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    const { username } = req.body;
    const allowedHandle = (localAuthState.license && localAuthState.license.tiktok_username)
        ? String(localAuthState.license.tiktok_username).replace('@', '').trim().toLowerCase()
        : null;

    const requestedHandle = username ? String(username).replace('@', '').trim().toLowerCase() : '';

    if (allowedHandle && requestedHandle !== allowedHandle) {
        return res.status(403).json({
            success: false,
            error: 'TIKTOK_HANDLE_MISMATCH',
            message: `Licencia vinculada exclusivamente a @${allowedHandle}`
        });
    }

    const connected = connectToTikTok(username);
    if (connected === false) {
        return res.status(403).json({
            success: false,
            error: 'TIKTOK_HANDLE_MISMATCH',
            message: `Licencia vinculada exclusivamente a @${allowedHandle}`
        });
    }

    return res.json({ success: true, username: requestedHandle });
});

// Route for Banner Cocina Widget
app.get('/banner-cocina', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'banner-cocina.html'));
});

// Rankings update and retrieval helpers
function extractAvatarUrl(roomInfo) {
    if (!roomInfo) return '';
    
    // Webcast API structure: roomInfo.data.owner
    if (roomInfo.data && roomInfo.data.owner) {
        const owner = roomInfo.data.owner;
        if (owner.avatar_thumb && owner.avatar_thumb.url_list && owner.avatar_thumb.url_list[0]) {
            return owner.avatar_thumb.url_list[0];
        }
        if (owner.profile_picture && owner.profile_picture.url_list && owner.profile_picture.url_list[0]) {
            return owner.profile_picture.url_list[0];
        }
        if (owner.avatar_medium && owner.avatar_medium.url_list && owner.avatar_medium.url_list[0]) {
            return owner.avatar_medium.url_list[0];
        }
        if (owner.avatar_large && owner.avatar_large.url_list && owner.avatar_large.url_list[0]) {
            return owner.avatar_large.url_list[0];
        }
        if (owner.profilePictureUrl) {
            return owner.profilePictureUrl;
        }
    }
    
    // HTML SIGI_STATE structure: roomInfo.liveRoomUserInfo.user
    if (roomInfo.liveRoomUserInfo && roomInfo.liveRoomUserInfo.user) {
        const user = roomInfo.liveRoomUserInfo.user;
        if (user.avatarThumb && user.avatarThumb.urlList && user.avatarThumb.urlList[0]) {
            return user.avatarThumb.urlList[0];
        }
        if (user.avatarMedium && user.avatarMedium.urlList && user.avatarMedium.urlList[0]) {
            return user.avatarMedium.urlList[0];
        }
        if (user.avatarLarger && user.avatarLarger.urlList && user.avatarLarger.urlList[0]) {
            return user.avatarLarger.urlList[0];
        }
    }

    // Direct owner properties if roomInfo is top-level user details
    if (roomInfo.owner) {
        const owner = roomInfo.owner;
        if (owner.profilePicture && owner.profilePicture.url && owner.profilePicture.url[0]) {
            return owner.profilePicture.url[0];
        }
        if (owner.avatarThumb && owner.avatarThumb.urlList && owner.avatarThumb.urlList[0]) {
            return owner.avatarThumb.urlList[0];
        }
    }
    
    if (roomInfo.user) {
        const user = roomInfo.user;
        if (user.avatarThumb && user.avatarThumb.urlList && user.avatarThumb.urlList[0]) {
            return user.avatarThumb.urlList[0];
        }
    }

    return '';
}

function updateMvp(username, nickname) {
    const likes = rankings.likes[username] ? rankings.likes[username].count : 0;
    const gifts = rankings.gifts[username] ? rankings.gifts[username].count : 0;
    const mvpScore = (gifts * 10) + likes;
    
    // Get the profilePictureUrl from likes or gifts ranking if available
    const profilePictureUrl = (rankings.gifts[username] && rankings.gifts[username].profilePictureUrl) || 
                              (rankings.likes[username] && rankings.likes[username].profilePictureUrl) || '';
    
    if (mvpScore > 0) {
        rankings.mvp[username] = { nickname, count: mvpScore, profilePictureUrl };
    }
}

function getTopRankings() {
    const sortCategory = (cat) => {
        return Object.entries(rankings[cat])
            .map(([username, data]) => ({ 
                username, 
                nickname: data.nickname, 
                count: data.count, 
                profilePictureUrl: data.profilePictureUrl || '' 
            }))
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

function broadcastSessionStats() {
    io.emit('session_stats_updated', {
        diamonds: totalSessionDiamonds,
        likes: totalSessionLikes,
        viewers: totalSessionViewers
    });
    // Save to file for persistence
    try {
        fs.writeFileSync(path.join(__dirname, 'session_stats.json'), JSON.stringify({
            diamonds: totalSessionDiamonds,
            likes: totalSessionLikes,
            viewers: totalSessionViewers,
            username: chatbotSettings.tiktokUsername,
            roomId: currentRoomId
        }), 'utf8');
    } catch (e) {
        console.error('Error saving session stats:', e);
    }
}

// Custom TTS generator for follows, shares, likes milestone and gift events
async function speakCustomTts(text, isGift = false) {
    if (!chatbotSettings || !chatbotSettings.active) return;
    if (chatbotSettings.ttsEngine !== 'cloud' && chatbotSettings.ttsEngine !== 'gemini') return;
    
    let voiceName = 'es-CO-SalomeNeural';
    if (chatbotSettings.ttsEngine === 'gemini') {
        voiceName = chatbotSettings.geminiVoiceName || 'Aoede';
    } else {
        voiceName = chatbotSettings.cloudVoiceName || 'es-CO-SalomeNeural';
    }
    let volume = chatbotSettings.volume ?? 1;
    let pitch = chatbotSettings.pitch ?? 1;
    let rate = chatbotSettings.rate ?? 1;
    
    const tempFile = path.join(writableDir, `temp_tts_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp3`);
    
    const ratePercentage = Math.round((rate - 1) * 100);
    const rateStr = ratePercentage >= 0 ? `+${ratePercentage}%` : `${ratePercentage}%`;
    const pitchPercentage = Math.round((pitch - 1) * 50);
    const pitchStr = pitchPercentage >= 0 ? `+${pitchPercentage}Hz` : `${pitchPercentage}Hz`;
    
    try {
        await synthesizeSpeech(text, voiceName, rateStr, pitchStr, tempFile);
        if (fs.existsSync(tempFile)) {
            let audioBuffer = fs.readFileSync(tempFile);
            let base64Audio = audioBuffer.toString('base64');
            
            io.emit('play_tts_audio', {
                base64Audio,
                playLocation: 'panel',
                isGift
            });
            
            fs.unlinkSync(tempFile);
            
            // Clear references immediately to free RAM
            audioBuffer = null;
            base64Audio = null;
            if (global.gc) {
                try { global.gc(); } catch (e) {}
            }
        }
    } catch (error) {
        console.error('Error generating custom event TTS:', error);
        if (fs.existsSync(tempFile)) {
            try { fs.unlinkSync(tempFile); } catch(e) {}
        }
    }
}

function triggerSoundAlert(alert) {
    if (!alert || !alert.enabled) return;
    const soundUrl = alert.sound;
    const volume = alert.volume !== undefined ? alert.volume : 100;
    console.log(`Triggering sound alert: ${alert.soundName || soundUrl} at volume ${volume}%`);
    io.emit('play_sound_alert', { soundUrl, volume });
}

const giftTTSAccumulator = {};
const processedGiftMsgIds = new Set();
const processedSocialMsgIds = new Set();
const rankingsGiftCounts = {};
const soundAlertGiftCounts = {};
const dinamicaGiftCounts = {};
const goalGiftCounts = {};
const soundAlertCooldowns = {};
const rawGiftCounts = {};
const rawGiftTimeTrack = {};
const lastProcessedGift = {}; // Strict sliding-window deduplication for gifts

function processAccumulatedGift(data, repeatCount) {
    const msgId = data.msgId || `gen_${data.uniqueId || 'unknown'}_${data.giftId || 'unknown'}_${data.createTime || Date.now()}`;
    
    if (processedGiftMsgIds.has(msgId)) {
        console.info(`[Monetization] Ignorando regalo duplicado para msgId: ${msgId}`);
        return;
    }
    
    processedGiftMsgIds.add(msgId);
    if (processedGiftMsgIds.size > 1000) {
        const firstValue = processedGiftMsgIds.values().next().value;
        processedGiftMsgIds.delete(firstValue);
    }

    const uniqueId = (data.uniqueId || '').toLowerCase();
    const nickname = data.nickname || data.uniqueId;
    const coins = getGiftCoinValue(data);
    const totalCoins = coins * repeatCount;
    
    // 0. Process Betting / Apuestas Game
    if (chatbotSettings.apuestas && chatbotSettings.apuestas.enabled) {
        const giftIdStr = String(data.giftId || '');
        const giftNameClean = (data.giftName || '').toLowerCase().trim();
        const activeCount = parseInt(chatbotSettings.apuestas.count) || 4;
        
        let voted = false;
        
        // Loop only through active participants
        for (let i = 1; i <= activeCount; i++) {
            const pKey = 'p' + i;
            const participant = chatbotSettings.apuestas[pKey];
            if (participant) {
                const pGiftId = String(participant.giftId || '');
                const pGiftName = (participant.giftName || '').toLowerCase().trim();
                
                // Match by ID or Name
                if ((pGiftId && pGiftId === giftIdStr) || (pGiftName && pGiftName === giftNameClean)) {
                    participant.votes = (participant.votes || 0) + repeatCount;
                    
                    // Capture voter username/nickname
                    participant.voters = participant.voters || [];
                    const voterIndex = participant.voters.findIndex(v => v.username.toLowerCase() === uniqueId);
                    if (voterIndex !== -1) {
                        participant.voters[voterIndex].count += repeatCount;
                        // Move to end to represent latest activity
                        const [voter] = participant.voters.splice(voterIndex, 1);
                        participant.voters.push(voter);
                    } else {
                        participant.voters.push({
                            username: data.uniqueId || uniqueId,
                            nickname: nickname,
                            count: repeatCount
                        });
                    }
                    
                    voted = true;
                    console.log(`[APUESTAS] Vote registered for ${participant.name}. Added ${repeatCount} votes. Total: ${participant.votes}. Voter: @${data.uniqueId}`);
                }
            }
        }
        
        if (voted) {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
            io.emit('chatbot_settings_updated', chatbotSettings);
            io.emit('apuestas_updated', chatbotSettings.apuestas);
        }
    }
    
    // 1. Grant music credits and track session coins
    if (totalCoins > 0 && chatbotSettings.spotifyMonetizationEnabled) {
        const minCoins = chatbotSettings.spotifyMinCoins || 5;
        
        // Track session coins for current user
        sessionGiftCoins[uniqueId] = (sessionGiftCoins[uniqueId] || 0) + totalCoins;
        
        const creditsEarned = Math.floor(totalCoins / minCoins);
        if (creditsEarned > 0) {
            userMusicCredits[uniqueId] = (userMusicCredits[uniqueId] || 0) + creditsEarned;
            console.info(`@${uniqueId} earned ${creditsEarned} music credits. Total: ${userMusicCredits[uniqueId]}. Session coins: ${sessionGiftCoins[uniqueId]}`);
            io.emit('system', { 
                type: 'success', 
                message: `@${nickname} ganó ${creditsEarned} crédito(s) de música por enviar ${totalCoins} monedas. ¡Tiene ${userMusicCredits[uniqueId]} créditos en total!` 
            });
        }
        
        // Broadcast the updated premium/monetized user lists to panel clients
        emitMonetizedUsersUpdate();  // Spotify
    }

    // 2. Grant AI credits
    const themeName = chatbotSettings.themeName || 'neutral';
    const aiProfile = themeName === 'majo' ? 'majo' : 'naya';
    const aiConfig = (chatbotSettings.ai && chatbotSettings.ai[aiProfile]) || {};

    if (totalCoins > 0 && aiConfig.ai_bot_active && aiConfig.ai_monetization_active) {
        const aiMinCoins = aiConfig.ai_min_coins || 5;
        const aiCreditsEarned = Math.floor(totalCoins / aiMinCoins);
        if (aiCreditsEarned > 0) {
            userAiCredits[uniqueId] = (userAiCredits[uniqueId] || 0) + aiCreditsEarned;
            console.info(`@${uniqueId} earned ${aiCreditsEarned} AI credits. Total: ${userAiCredits[uniqueId]}`);
            io.emit('system', { 
                type: 'success', 
                message: `@${nickname} ganó ${aiCreditsEarned} crédito(s) de IA por enviar ${totalCoins} monedas. ¡Tiene ${userAiCredits[uniqueId]} créditos de IA en total!` 
            });
        }
    }


    // Check Interactive Wheel trigger (only once per accumulated gift combo)
    if (chatbotSettings.wheelEnabled && chatbotSettings.wheelOptions && chatbotSettings.wheelOptions.length > 0) {
        const triggerGift = (chatbotSettings.wheelTriggerGift || 'any').toLowerCase().trim();
        const triggerCoins = parseInt(chatbotSettings.wheelTriggerCoins || 10);
        
        let qualifies = false;
        if (triggerGift !== 'any' && giftNamesMatch(triggerGift, data.giftName)) {
            qualifies = true;
        } else if (triggerGift === 'any' && totalCoins >= triggerCoins) {
            qualifies = true;
        }
        
        if (qualifies) {
            const winIndex = Math.floor(Math.random() * chatbotSettings.wheelOptions.length);
            const winText = chatbotSettings.wheelOptions[winIndex];
            console.log(`[WHEEL] Triggered! Winner option index ${winIndex}: "${winText}"`);
            
            io.emit('trigger_wheel', {
                sender: data.nickname,
                giftName: data.giftName,
                winningIndex: winIndex,
                optionText: winText
            });
            
            setTimeout(() => {
                const cleanSender = stripEmojis(data.nickname || data.uniqueId);
                const speakText = `¡Wow! ${cleanSender} activó la ruleta y tocó: ${winText}!`;
                if (!isBannedText(uniqueId, true) && !isBannedText(cleanSender, true)) {
                    speakCustomTts(speakText);
                }
            }, 7000);
        }
    }

    // 3. Speak custom TTS for the gift
    if (chatbotSettings.readGiftsEnabled && !isBannedText(uniqueId, true) && !isBannedText(nickname, true)) {
        const action = chatbotSettings.giftAction || 'read';
        const soundFile = chatbotSettings.giftSound;

        // Play sound if action is 'sound' or 'both'
        if ((action === 'sound' || action === 'both') && soundFile) {
            io.emit('play_sound_alert', { soundUrl: soundFile, volume: 100 });
        }

        // Play TTS if action is 'read' or 'both'
        if (action === 'read' || action === 'both') {
            const giftName = data.giftName;
            const displayName = stripEmojis(nickname);
            let ttsText = "";
            
            const customPhrase = chatbotSettings.thankYouGiftPhrase;
            if (customPhrase && customPhrase.trim() !== "") {
                ttsText = formatCustomPhrase(customPhrase, 'gift', displayName, giftName, repeatCount);
            } else {
                const theme = chatbotSettings.themeName || 'neutral';
                if (theme === 'naya') {
                    ttsText = `¡Wow, muchísimas gracias @${displayName} por regalar ${repeatCount} ${giftName} a Naya!`;
                } else if (theme === 'majo') {
                    ttsText = `¡Gracias @${displayName} por enviar ${repeatCount} ${giftName} al directo de Majo!`;
                } else {
                    ttsText = `¡Gracias @${displayName} por regalar ${repeatCount} ${giftName}!`;
                }
            }
            speakCustomTts(ttsText, true);
        }
        
        // 3. AI Auto-Gift Response
        const themeName = chatbotSettings?.themeName || 'neutral';
        const aiProfile = themeName === 'majo' ? 'majo' : 'naya';
        const aiConfig = (chatbotSettings?.ai && chatbotSettings.ai[aiProfile]) || {};
        
        if (aiConfig.ai_bot_active && aiConfig.ai_gift_auto) {
            const giftMinCoins = parseInt(aiConfig.ai_gift_min_coins) || 100;
            if (totalCoins >= giftMinCoins) {
                aiQueueCounter++;
                aiCommandQueue.push({
                    id: `ai_${Date.now()}_${aiQueueCounter}`,
                    uniqueId,
                    nickname,
                    prompt: `Agradécele a ${nickname} con mucha emoción por enviarte ${repeatCount} regalo(s) de ${data.giftName}.`,
                    comment: `Regalo (${data.giftName})`,
                    isAutoGift: true
                });
                console.info(`[AI Gemini] Regalo automático encolado para @${uniqueId} (Posición ${aiCommandQueue.length})`);
                emitAiQueueUpdate();
            }
        }
    }
}

function processFollowEvent(data) {
    const msgId = data.msgId || `follow_${data.uniqueId || 'unknown'}_${Date.now()}`;
    if (processedSocialMsgIds.has(msgId)) return;
    processedSocialMsgIds.add(msgId);
    if (processedSocialMsgIds.size > 500) {
        const first = processedSocialMsgIds.values().next().value;
        processedSocialMsgIds.delete(first);
    }

    const uniqueId = (data.uniqueId || '').toLowerCase();
    const nickname = data.nickname || data.uniqueId || 'Nuevo Seguidor';
    
    // Update dynamic goals progress
    updateGoalProgress('follows', 1);
    updateDinamicaGoalProgress('follows', 1);
    
    // Blacklist & Banned Username check
    const blacklist = (chatbotSettings.ignoreUserList || []).map(u => u.toLowerCase().trim());
    if (!blacklist.includes(uniqueId) && !isBannedText(uniqueId, true) && !isBannedText(nickname, true)) {
        // Trigger Sound Alerts for Follows
        if (chatbotSettings.soundAlertsEnabled && chatbotSettings.soundAlerts) {
            chatbotSettings.soundAlerts.forEach(alert => {
                if (alert.enabled && alert.type === 'follow') {
                    triggerSoundAlert(alert);
                }
            });
        }

        if (chatbotSettings.readFollowsEnabled) {
            const action = chatbotSettings.followAction || 'read';
            const soundFile = chatbotSettings.followSound;

            // Play sound if action is 'sound' or 'both'
            if ((action === 'sound' || action === 'both') && soundFile) {
                io.emit('play_sound_alert', { soundUrl: soundFile, volume: 100 });
            }

            // Play TTS if action is 'read' or 'both'
            if (action === 'read' || action === 'both') {
                const displayName = stripEmojis(nickname);
                let ttsText = "";
                const customPhrase = chatbotSettings.thankYouFollowPhrase;
                if (customPhrase && customPhrase.trim() !== "") {
                    ttsText = formatCustomPhrase(customPhrase, 'follow', displayName);
                } else {
                    const theme = chatbotSettings.themeName || 'neutral';
                    if (theme === 'naya') {
                        ttsText = `¡Bienvenido @${displayName} a la transmisión de Naya! Gracias por seguirme, linda.`;
                    } else if (theme === 'majo') {
                        ttsText = `¡Bienvenido @${displayName} a la telaraña de Majo! Gracias por unirte a nosotros.`;
                    } else {
                        ttsText = `¡Bienvenido @${displayName}, gracias por seguir la cuenta!`;
                    }
                }
                speakCustomTts(ttsText);
            }
        }
    }
}

function processShareEvent(data) {
    const msgId = data.msgId || `share_${data.uniqueId || 'unknown'}_${Date.now()}`;
    if (processedSocialMsgIds.has(msgId)) return;
    processedSocialMsgIds.add(msgId);
    if (processedSocialMsgIds.size > 500) {
        const first = processedSocialMsgIds.values().next().value;
        processedSocialMsgIds.delete(first);
    }

    const uniqueId = (data.uniqueId || '').toLowerCase();
    const nickname = data.nickname || data.uniqueId || 'Espectador';
    
    // Update dynamic goals progress
    updateGoalProgress('shares', 1);
    
    // Blacklist & Banned Username check
    const blacklist = (chatbotSettings.ignoreUserList || []).map(u => u.toLowerCase().trim());
    if (!blacklist.includes(uniqueId) && !isBannedText(uniqueId, true) && !isBannedText(nickname, true)) {
        // Trigger Sound Alerts for Shares
        if (chatbotSettings.soundAlertsEnabled && chatbotSettings.soundAlerts) {
            chatbotSettings.soundAlerts.forEach(alert => {
                if (alert.enabled && alert.type === 'share') {
                    triggerSoundAlert(alert);
                }
            });
        }

        if (chatbotSettings.readSharesEnabled) {
            const action = chatbotSettings.shareAction || 'read';
            const soundFile = chatbotSettings.shareSound;

            // Play sound if action is 'sound' or 'both'
            if ((action === 'sound' || action === 'both') && soundFile) {
                io.emit('play_sound_alert', { soundUrl: soundFile, volume: 100 });
            }

            // Play TTS if action is 'read' or 'both'
            if (action === 'read' || action === 'both') {
                const displayName = stripEmojis(nickname);
                let ttsText = "";
                const customPhrase = chatbotSettings.thankYouSharePhrase;
                if (customPhrase && customPhrase.trim() !== "") {
                    ttsText = formatCustomPhrase(customPhrase, 'share', displayName);
                } else {
                    const theme = chatbotSettings.themeName || 'neutral';
                    if (theme === 'naya') {
                        ttsText = `¡Muchísimas gracias @${displayName} por compartir el directo de Naya! Eres un sol.`;
                    } else if (theme === 'majo') {
                        ttsText = `¡Gracias @${displayName} por compartir el live de Majo! Súper genial.`;
                    } else {
                        ttsText = `¡Gracias @${displayName} por compartir la transmisión!`;
                    }
                }
                speakCustomTts(ttsText);
            }
        }
    }
}

// TTS Queue & Rate Limiter State Variables
let ttsQueue = [];
let isProcessingTts = false;
let ttsMessageTimestamps = [];

let tiktokLiveConnection = null;
let isBacklogBuffering = false;
let backlogChatMessages = [];

// In-memory progress tracker for auto-registered gift goals
const giftMetasProgress = {};

function emitDinamicasData() {
    io.emit('initDinamicas', dinamicasConfig);
}

function updateDinamicaGoalProgress(type, amount, giftId = null) {
    if (!dinamicasConfig || !Array.isArray(dinamicasConfig) || dinamicasConfig.length === 0) return;
    
    let updated = false;
    dinamicasConfig.forEach(goal => {
        if (!goal.enabled) return;
        
        let match = false;
        if (goal.type === type) {
            if (type === 'gift') {
                if (goal.giftId && String(goal.giftId) === String(giftId)) {
                    match = true;
                }
            } else {
                match = true;
            }
        }
        
        if (match) {
            goal.current = (goal.current || 0) + amount;
            if (goal.current > goal.target) goal.current = goal.target;
            updated = true;
        }
    });
    
    if (updated) {
        try {
            fs.writeFileSync(DINAMICAS_CONFIG_FILE, JSON.stringify(dinamicasConfig, null, 2), 'utf8');
            emitDinamicasData();
        } catch (e) {
            console.error('Error saving updated dynamic goal progress:', e);
        }
    }
}

function loadProfile(username) {
    if (!username) {
        SETTINGS_FILE = DEFAULT_SETTINGS_FILE;
        SOUNDS_CONFIG_FILE = DEFAULT_SOUNDS_CONFIG_FILE;
        DINAMICAS_CONFIG_FILE = DEFAULT_DINAMICAS_CONFIG_FILE;
        RECETAS_CONFIG_FILE = DEFAULT_RECETAS_CONFIG_FILE;
        GOALS_CATALOG_FILE = DEFAULT_GOALS_CATALOG_FILE;
        return;
    }
    
    const sanitized = username.trim().toLowerCase().replace('@', '');
    if (!sanitized) return;
    
    console.info(`[Profile Manager] Cargando perfil para @${sanitized}`);
    
    SETTINGS_FILE = path.join(writableDir, `chatbot_settings_${sanitized}.json`);
    SOUNDS_CONFIG_FILE = path.join(writableDir, `sounds_config_${sanitized}.json`);
    DINAMICAS_CONFIG_FILE = path.join(writableDir, `dinamicas_config_${sanitized}.json`);
    RECETAS_CONFIG_FILE = path.join(writableDir, `recetas_config_${sanitized}.json`);
    GOALS_CATALOG_FILE = path.join(writableDir, `goals_catalog_${sanitized}.json`);
    
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            chatbotSettings = readJsonFileSafe(SETTINGS_FILE, chatbotSettings);
            // Sanitization checks for apuestas and allowed users
            let needsWrite = false;
            if (chatbotSettings.apuestas) {
                if (chatbotSettings.apuestas.p1 && chatbotSettings.apuestas.p1.name === "Naya") {
                    chatbotSettings.apuestas.p1.name = "Participante 1";
                    needsWrite = true;
                }
                if (chatbotSettings.apuestas.p2 && chatbotSettings.apuestas.p2.name === "Majo") {
                    chatbotSettings.apuestas.p2.name = "Participante 2";
                    needsWrite = true;
                }
            }
            if (chatbotSettings.spotifySkipAllowedUsers === undefined) {
                chatbotSettings.spotifySkipAllowedUsers = "";
                needsWrite = true;
            }


            // Enforce theme strictly based on connected username to prevent data leakage and manual overrides
            const lowerUsername = sanitized.toLowerCase();
            let computedTheme = 'neutral';
            if (lowerUsername.includes("majo")) {
                computedTheme = "majo";
            } else if (lowerUsername.includes("naya")) {
                computedTheme = "naya";
            }
            if (chatbotSettings.themeName !== computedTheme) {
                chatbotSettings.themeName = computedTheme;
                needsWrite = true;
                console.info(`[Profile Manager] Auto-assigned theme '${computedTheme}' for user @${sanitized}`);
            }
            if (chatbotSettings.tiktokUsername !== sanitized) {
                chatbotSettings.tiktokUsername = sanitized;
                needsWrite = true;
            }
            if (needsWrite) {
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2), 'utf8');
                console.info(`[Profile Manager] Sanitized and saved config to ${SETTINGS_FILE}`);
            }
        } else {
            chatbotSettings.tiktokUsername = sanitized;
            // Enforce theme strictly based on connected username for new profiles
            const lowerUsername = sanitized.toLowerCase();
            if (lowerUsername.includes("majo")) {
                chatbotSettings.themeName = "majo";
            } else if (lowerUsername.includes("naya")) {
                chatbotSettings.themeName = "naya";
            } else {
                chatbotSettings.themeName = "neutral";
            }
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2), 'utf8');
            console.info(`[Profile Manager] Creado nuevo archivo de chatbot_settings para @${sanitized}`);
        }
        
        if (fs.existsSync(SOUNDS_CONFIG_FILE)) {
            soundsConfig = readJsonFileSafe(SOUNDS_CONFIG_FILE, {});
        } else {
            soundsConfig = {};
            fs.writeFileSync(SOUNDS_CONFIG_FILE, JSON.stringify(soundsConfig, null, 2), 'utf8');
            console.info(`[Profile Manager] Creado nuevo archivo de sounds_config para @${sanitized}`);
        }
        
        if (fs.existsSync(DINAMICAS_CONFIG_FILE)) {
            dinamicasConfig = readJsonFileSafe(DINAMICAS_CONFIG_FILE, []);
        } else {
            dinamicasConfig = [];
            fs.writeFileSync(DINAMICAS_CONFIG_FILE, JSON.stringify(dinamicasConfig, null, 2), 'utf8');
            console.info(`[Profile Manager] Creado nuevo archivo de dinamicas_config para @${sanitized}`);
        }
        
        if (fs.existsSync(RECETAS_CONFIG_FILE)) {
            recetasConfig = readJsonFileSafe(RECETAS_CONFIG_FILE, recetasConfig);
        } else {
            fs.writeFileSync(RECETAS_CONFIG_FILE, JSON.stringify(recetasConfig, null, 2), 'utf8');
            console.info(`[Profile Manager] Creado nuevo archivo de recetas_config para @${sanitized}`);
        }
        
        if (fs.existsSync(GOALS_CATALOG_FILE)) {
            goalsCatalog = readJsonFileSafe(GOALS_CATALOG_FILE, {});
        } else {
            goalsCatalog = {};
            const brainData = readJsonFileSafe(GIFTS_MAPPING_FILE, {});
            Object.entries(brainData).forEach(([gid, gdata]) => {
                goalsCatalog[gid] = { name: gdata.name, coins: gdata.coins, image: gdata.image };
            });
            fs.writeFileSync(GOALS_CATALOG_FILE, JSON.stringify(goalsCatalog, null, 2), 'utf8');
            console.info(`[Profile Manager] Creado nuevo archivo de goals_catalog para @${sanitized}`);
        }
        
        try {
            const globalSettings = readJsonFileSafe(DEFAULT_SETTINGS_FILE, {});
            globalSettings.tiktokUsername = sanitized;
            fs.writeFileSync(DEFAULT_SETTINGS_FILE, JSON.stringify(globalSettings, null, 2), 'utf8');
        } catch (err) {
            console.error('[Profile Manager] Error al actualizar puntero global:', err);
        }
        
        if (typeof io !== 'undefined' && io) {
            io.emit('chatbot_settings_updated', chatbotSettings);
            io.emit('initSoundsConfig', soundsConfig);
            io.emit('initDinamicas', dinamicasConfig);
            io.emit('initReceta', recetasConfig);
            io.emit('initGoalsCatalog', goalsCatalog);
            io.emit('goals_updated', chatbotSettings.goals);
        }
        
    } catch (e) {
        console.error(`[Profile Manager] Error cargando el perfil de @${sanitized}:`, e);
    }
}

let lastAnnouncedBattleId = null;
const announcedBoosters = new Set();

let sessionViewers = {};
let lastViewerLogEmitTime = 0;
let viewerLogPendingUpdate = false;
let currentConnectedCreator = '';

const HISTORY_DIR = path.join(writableDir, 'history');
if (!fs.existsSync(HISTORY_DIR)) {
    try { fs.mkdirSync(HISTORY_DIR, { recursive: true }); } catch (e) {}
}

function registerSessionViewer(uniqueId, nickname, avatarUrl, eventType, count = 1) {
    if (!uniqueId) return;
    const uidLower = uniqueId.toLowerCase().trim();
    const timeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    if (!sessionViewers[uidLower]) {
        sessionViewers[uidLower] = {
            uniqueId: uniqueId,
            nickname: nickname || uniqueId,
            avatar: avatarUrl || '',
            firstSeen: timeStr,
            lastSeen: timeStr,
            chats: eventType === 'chat' ? 1 : 0,
            likes: eventType === 'like' ? count : 0,
            gifts: eventType === 'gift' ? count : 0,
            followed: eventType === 'follow' ? 1 : 0,
            shared: eventType === 'share' ? 1 : 0
        };
    } else {
        const viewer = sessionViewers[uidLower];
        viewer.lastSeen = timeStr;
        if (nickname) viewer.nickname = nickname;
        if (avatarUrl) viewer.avatar = avatarUrl;
        
        if (eventType === 'chat') viewer.chats += count;
        if (eventType === 'like') viewer.likes += count;
        if (eventType === 'gift') viewer.gifts += count;
        if (eventType === 'follow') viewer.followed = 1;
        if (eventType === 'share') viewer.shared = 1;
    }
    
    emitViewerLogThrottled();
}

function emitViewerLogThrottled() {
    const now = Date.now();
    if (now - lastViewerLogEmitTime > 2000) {
        lastViewerLogEmitTime = now;
        viewerLogPendingUpdate = false;
        io.emit('viewer_log_updated', Object.values(sessionViewers));
    } else {
        if (!viewerLogPendingUpdate) {
            viewerLogPendingUpdate = true;
            setTimeout(() => {
                lastViewerLogEmitTime = Date.now();
                viewerLogPendingUpdate = false;
                io.emit('viewer_log_updated', Object.values(sessionViewers));
            }, 2000);
        }
    }
}

function saveViewerSessionHistory() {
    try {
        const viewerCount = Object.keys(sessionViewers).length;
        if (viewerCount === 0) return;
        
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
        
        const filename = `espectadores_${currentConnectedCreator || 'stream'}_${dateStr}_${timeStr}.json`;
        const filepath = path.join(HISTORY_DIR, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(Object.values(sessionViewers), null, 2), 'utf8');
        console.info(`[Historial] Sesión de espectadores guardada en: ${filepath} (${viewerCount} usuarios)`);
        
        cleanupOldHistoryFiles();
    } catch (err) {
        console.error('[Historial] Error al guardar historial de sesión:', err);
    }
}

function cleanupOldHistoryFiles() {
    try {
        if (!fs.existsSync(HISTORY_DIR)) return;
        const files = fs.readdirSync(HISTORY_DIR);
        const now = Date.now();
        const twoDaysMs = 2 * 24 * 60 * 60 * 1000; // 2 days
        
        let deletedAny = false;
        let deletedNames = [];
        
        files.forEach(file => {
            if (!file.endsWith('.json')) return;
            const filepath = path.join(HISTORY_DIR, file);
            const stats = fs.statSync(filepath);
            
            if (now - stats.mtimeMs > twoDaysMs) {
                fs.unlinkSync(filepath);
                deletedAny = true;
                deletedNames.push(file);
                console.info(`[Historial] Archivo de historial viejo eliminado: ${file}`);
            }
        });
        
        if (deletedAny) {
            setTimeout(() => {
                io.emit('system', { 
                    type: 'error', 
                    message: `⚠️ [Espacio] Registros de usuarios con más de 2 días de antigüedad fueron eliminados automáticamente para liberar espacio (${deletedNames.join(', ')}).` 
                });
            }, 3000);
        }
    } catch (err) {
        console.error('[Historial] Error limpiando historiales antiguos:', err);
    }
}

// Process exit listeners to ensure saving viewer log on exit
process.on('exit', () => {
    saveViewerSessionHistory();
});
process.on('SIGINT', () => {
    saveViewerSessionHistory();
    process.exit();
});
process.on('SIGTERM', () => {
    saveViewerSessionHistory();
    process.exit();
});

function checkBattleRewardsRecursive(obj) {
    if (!obj || typeof obj !== 'object') return false;
    
    for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        const val = obj[key];
        const lowerKey = key.toLowerCase();
        
        if (lowerKey.includes('reward') || lowerKey.includes('booster') || lowerKey.includes('item') || lowerKey.includes('glove_pool')) {
            if (val === true || val === 1 || val === '1' || (typeof val === 'object' && val !== null && Object.keys(val).length > 0)) {
                return true;
            }
        }
        
        if (typeof val === 'object' && val !== null) {
            if (checkBattleRewardsRecursive(val)) return true;
        }
    }
    
    try {
        const str = JSON.stringify(obj).toLowerCase();
        if (str.includes('reward_pool') || str.includes('has_rewards') || str.includes('glove_pool') || str.includes('battle_rewards')) {
            return true;
        }
    } catch (e) {}
    
    return false;
}

function detectActiveBoosters(obj) {
    const boosters = [];
    if (!obj || typeof obj !== 'object') return boosters;
    
    try {
        const str = JSON.stringify(obj).toLowerCase();
        if (str.includes('glove') || str.includes('guante') || str.includes('crit')) {
            boosters.push('Guante (Crit)');
        }
        if (str.includes('mist') || str.includes('niebla') || str.includes('smoke')) {
            boosters.push('Niebla (Mist)');
        }
        if (str.includes('speed') || str.includes('velocidad') || str.includes('booster_x')) {
            boosters.push('Multiplicador de Velocidad (x2/x3)');
        }
        if (str.includes('timer') || str.includes('clock') || str.includes('reloj') || str.includes('extra_time')) {
            boosters.push('Reloj (Tiempo Extra)');
        }
    } catch (e) {}
    
    return boosters;
}

function connectToTikTok(username) {
    if (!localAuthState.isAuthed) {
        console.warn('[Security] Connection attempt blocked: TavLive is locked / unauthenticated.');
        io.emit('tiktok_disconnected', { error: 'Acceso Denegado: Debes iniciar sesión en TavLive para conectar a TikTok LIVE.' });
        return false;
    }

    // TikTok Handle Binding Verification (Subphase 8A)
    const allowedHandle = (localAuthState.license && localAuthState.license.tiktok_username)
        ? String(localAuthState.license.tiktok_username).replace('@', '').trim().toLowerCase()
        : null;

    const requestedHandle = username ? String(username).replace('@', '').trim().toLowerCase() : '';

    if (allowedHandle && requestedHandle !== allowedHandle) {
        console.warn(`[Security 8A] Connection attempt blocked: Target handle '${requestedHandle}' does not match licensed handle '${allowedHandle}'.`);
        io.emit('tiktok_disconnected', { error: `Acceso Denegado: Tu licencia está vinculada exclusivamente a @${allowedHandle}.` });
        return false;
    }

    try {
        saveViewerSessionHistory();
    } catch (e) {}
    sessionViewers = {};
    currentConnectedCreator = username || 'stream';
    
    if (username) {
        loadProfile(username);
    }
    if (tiktokLiveConnection) {
        try {
            tiktokLiveConnection.removeAllListeners();
            tiktokLiveConnection.disconnect();
        } catch (e) {
            console.error('Error disconnecting old connection:', e);
        }
        tiktokLiveConnection = null;
    }
    
    const connectionRef = new WebcastPushConnection(username);
    tiktokLiveConnection = connectionRef;

    // Register auto-cleanup listeners
    connectionRef.on('disconnected', () => {
        console.info('[TikTok Connector] Conexión perdida/cerrada.');
        try {
            saveViewerSessionHistory();
        } catch (e) {}
        sessionViewers = {};
        io.emit('viewer_log_updated', []);
        if (tiktokLiveConnection === connectionRef) {
            tiktokLiveConnection = null;
        }
        currentCreatorAvatar = '';
        io.emit('system', { type: 'error', message: 'CONEXIÓN PERDIDA' });
        io.emit('tiktok_disconnected');
    });

    connectionRef.on('streamEnd', () => {
        console.info('[TikTok Connector] Transmisión terminada.');
        try {
            saveViewerSessionHistory();
        } catch (e) {}
        sessionViewers = {};
        io.emit('viewer_log_updated', []);
        if (tiktokLiveConnection === connectionRef) {
            tiktokLiveConnection = null;
        }
        currentCreatorAvatar = '';
        io.emit('system', { type: 'error', message: 'TRANSMISIÓN FINALIZADA' });
        io.emit('tiktok_disconnected');
    });
    
    isBacklogBuffering = true;
    backlogChatMessages = [];
    
    // Buffer backlog comments for 1.5 seconds and only read the last 2 comments
    setTimeout(() => {
        isBacklogBuffering = false;
        const messagesToProcess = backlogChatMessages.slice(-2);
        console.info(`[TikTok Connector] Backlog buffering ended. Processing last ${messagesToProcess.length} of ${backlogChatMessages.length} comments.`);
        messagesToProcess.forEach(msg => {
            handleCloudTTS(msg);
            handleSpotifyChatCommand(msg);
            handleAiChatCommand(msg);
        });
        backlogChatMessages = [];
    }, 1500);

    connectionRef.connect().then(state => {
        console.info(`Connected to roomId ${state.roomId}`);
        currentRoomId = state.roomId || '';
        // Reset session rankings and music credits
        rankings = { likes: {}, gifts: {}, mvp: {} };
        userMusicCredits = {};
        userAiCredits = {};
        sessionGiftCoins = {};
        
        let avatarUrl = '';
        if (state.roomInfo) {
            avatarUrl = extractAvatarUrl(state.roomInfo);
        } else if (connectionRef.roomInfo) {
            avatarUrl = extractAvatarUrl(connectionRef.roomInfo);
        }
        currentCreatorAvatar = avatarUrl;

        // Initialize or restore session stats
        let diamonds = 0;
        let likes = 0;
        let viewers = 0;
        
        if (state.roomInfo && state.roomInfo.data && state.roomInfo.data.stats) {
            const stats = state.roomInfo.data.stats;
            diamonds = parseInt(stats.fan_ticket) || 0;
            likes = parseInt(stats.like_count) || 0;
            viewers = parseInt(stats.total_user) || 0;
        } else if (connectionRef.roomInfo && connectionRef.roomInfo.data && connectionRef.roomInfo.data.stats) {
            const stats = connectionRef.roomInfo.data.stats;
            diamonds = parseInt(stats.fan_ticket) || 0;
            likes = parseInt(stats.like_count) || 0;
            viewers = parseInt(stats.total_user) || 0;
        }
        
        try {
            const statsFile = path.join(__dirname, 'session_stats.json');
            if (fs.existsSync(statsFile)) {
                const saved = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
                if (saved.username === username && saved.roomId === state.roomId) {
                    diamonds = Math.max(diamonds, saved.diamonds || 0);
                    likes = Math.max(likes, saved.likes || 0);
                    viewers = Math.max(viewers, saved.viewers || 0);
                }
            }
        } catch (e) {
            console.error('Error loading saved session stats:', e);
        }

        totalSessionDiamonds = diamonds;
        totalSessionLikes = likes;
        totalSessionViewers = viewers;



        io.emit('tiktok_connected', { username, avatarUrl });
        broadcastSessionStats();
        broadcastRankings();
        io.emit('system', { type: 'connected', message: `Conectado a @${username}` });
    }).catch(err => {
        console.log('Failed to connect', err);
        if (tiktokLiveConnection === connectionRef) {
            tiktokLiveConnection = null; // Clean up truthy object on failure
        }
        currentCreatorAvatar = '';
        io.emit('system', { type: 'error', message: `Fallo al conectar: ${err.message}` });
        io.emit('tiktok_disconnected');
    });
    


    const eventsToListen = [
        'gift', 'chat', 'like', 'member', 'roomUserSeq', 'roomUser', 'social', 
        'envelope', 'questionNew', 'linkMicBattle', 'linkMicArmies', 
        'liveIntro', 'emote', 'envelope', 'follow', 'share'
    ];

    eventsToListen.forEach(eventType => {
        connectionRef.on(eventType, data => {
            if (data && data.uniqueId) {
                const count = parseInt(data.repeatCount || data.likeCount || 1) || 1;
                const avatar = data.profilePictureUrl || '';
                registerSessionViewer(data.uniqueId, data.nickname, avatar, eventType, count);
            }
            if (eventType === 'gift' && data) {
                const uniqueId = (data.uniqueId || '').toLowerCase().trim();
                const giftId = String(data.giftId);
                const repeatCount = parseInt(data.repeatCount) || 1;
                const msgId = data.msgId;
                const now = Date.now();
                
                // Filtro estricto de ventana de tiempo deslizante por combo (5 segundos por usuario y ID de regalo)
                if (!lastProcessedGift[uniqueId]) {
                    lastProcessedGift[uniqueId] = {};
                }
                const last = lastProcessedGift[uniqueId][giftId];
                if (last) {
                    const timeDiff = now - last.timestamp;
                    if (timeDiff < 5000) {
                        if (repeatCount <= last.repeatCount) {
                            console.log(`[Deduplicación Regalo] Ignorando duplicado estricto para @${uniqueId} (Clave: ${giftId}, diferencia: ${timeDiff}ms, Count: ${repeatCount} <= ${last.repeatCount})`);
                            return;
                        }
                    }
                }
                lastProcessedGift[uniqueId][giftId] = { repeatCount, timestamp: now };
                
                // 1. Deduplicación por msgId
                if (msgId) {
                    const prevMax = rawGiftCounts[msgId] || 0;
                    if (repeatCount <= prevMax) {
                        return;
                    }
                    rawGiftCounts[msgId] = repeatCount;
                }
                
                // 2. Deduplicación por ventana de tiempo (2.5 segundos para la misma cantidad)
                const timeKey = `${uniqueId}_${giftId}_${repeatCount}`;
                const lastTime = rawGiftTimeTrack[timeKey] || 0;
                
                if (now - lastTime <= 2500) {
                    console.log(`[Deduplicación Regalo] Ignorando duplicado de tiempo para clave: ${timeKey} (diferencia: ${now - lastTime}ms)`);
                    return;
                }
                rawGiftTimeTrack[timeKey] = now;
                
                if (Object.keys(rawGiftCounts).length > 2000) {
                    const keys = Object.keys(rawGiftCounts);
                    delete rawGiftCounts[keys[0]];
                }
                
                const keys = Object.keys(rawGiftTimeTrack);
                if (keys.length > 2000) {
                    for (const k of keys) {
                        if (now - rawGiftTimeTrack[k] > 10000) {
                            delete rawGiftTimeTrack[k];
                        }
                    }
                }
            }
            
            io.emit('tiktok_event_raw', { eventType, data });

            // Accumulate/update live statistics
            if (eventType === 'gift' && data) {
                const count = parseInt(data.repeatCount) || 1;
                const coins = parseInt(data.diamondCount) || 0;
                totalSessionDiamonds += (count * coins);
                broadcastSessionStats();
            } else if (eventType === 'like' && data) {
                const count = parseInt(data.likeCount) || 1;
                if (data.totalLikeCount !== undefined) {
                    totalSessionLikes = Math.max(totalSessionLikes, parseInt(data.totalLikeCount) || 0);
                } else {
                    totalSessionLikes += count;
                }
                broadcastSessionStats();
            } else if ((eventType === 'roomUserSeq' || eventType === 'roomUser') && data) {
                if (data.totalUser !== undefined) {
                    totalSessionViewers = Math.max(totalSessionViewers, parseInt(data.totalUser) || 0);
                } else if (data.viewerCount !== undefined) {
                    totalSessionViewers = Math.max(totalSessionViewers, parseInt(data.viewerCount) || 0);
                }
                broadcastSessionStats();
            }
            
            if (eventType === 'chat') {
                if (isBacklogBuffering) {
                    backlogChatMessages.push(data);
                } else {
                    handleCloudTTS(data);
                    handleSpotifyChatCommand(data);
                    handleAiChatCommand(data);
                }
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
                const uniqueId = (data.uniqueId || '').toLowerCase();
                const nickname = data.nickname || data.uniqueId;
                const coins = data.diamondCount || 0;
                const msgId = data.msgId || `gen_${uniqueId}_${data.giftId}_${data.createTime || Date.now()}`;
                const repeatCount = data.repeatCount || 1;

                // Banned Username check for gift TTS/processing
                const usernameIsBanned = isBannedText(uniqueId, true) || isBannedText(nickname, true);

                // Add to Quiéreme list if valid "Heart Me" / "Quiéreme" gift is sent
                if (!usernameIsBanned && (String(data.giftId) === '7934' || (data.giftName && (data.giftName.toLowerCase().includes('heart me') || data.giftName.toLowerCase().includes('quiereme') || data.giftName.toLowerCase().includes('quiéreme'))))) {
                    quieremeAllowedUsers.add(uniqueId);
                    console.info(`[Quiereme] Usuario @${uniqueId} ha enviado un Heart Me/Quiéreme. Autorizado para TTS por hoy.`);
                }

                // Trigger sound alert immediately on count increment with deduplication and combo limits
                const soundPrevMax = soundAlertGiftCounts[msgId] || 0;
                if (repeatCount > soundPrevMax) {
                    soundAlertGiftCounts[msgId] = repeatCount;
                    if (Object.keys(soundAlertGiftCounts).length > 1000) {
                        const keys = Object.keys(soundAlertGiftCounts);
                        delete soundAlertGiftCounts[keys[0]];
                    }

                    // Deduplicate identical events (same user, gift, and count) within 1.5s
                    const dupKey = `${uniqueId}_${data.giftId}_${repeatCount}`;
                    const now = Date.now();
                    const lastPlayTime = soundAlertCooldowns[dupKey] || 0;
                    
                    if (now - lastPlayTime > 1500) {
                        soundAlertCooldowns[dupKey] = now;
                        
                        // Clear old keys from soundAlertCooldowns periodically
                        if (Object.keys(soundAlertCooldowns).length > 1000) {
                            const keys = Object.keys(soundAlertCooldowns);
                            for (const k of keys) {
                                if (now - soundAlertCooldowns[k] > 10000) {
                                    delete soundAlertCooldowns[k];
                                }
                            }
                        }

                        // Apply the combo repetition rules:
                        // "El sonido solo sera repetitivo si supera mas de las 3 veces, cosa contraria sonara 1 vez en caso que lo envien por combo"
                        let shouldPlaySound = false;
                        if (repeatCount === 1) {
                            shouldPlaySound = true;
                        } else if (repeatCount > 3) {
                            shouldPlaySound = true;
                        }

                        if (shouldPlaySound && chatbotSettings.soundAlertsEnabled) {
                            try {
                                if (fs.existsSync(SOUNDS_CONFIG_FILE)) {
                                    const configData = JSON.parse(fs.readFileSync(SOUNDS_CONFIG_FILE, 'utf8'));
                                    const alert = configData[String(data.giftId)];
                                    if (alert && alert.sound) {
                                        const soundUrl = `http://127.0.0.1:${PORT}/sound-assets/${alert.sound}`;
                                        console.log(`[SoundAlert] Triggering immediate gift sound: ${alert.sound} for msgId ${msgId} (combo x${repeatCount})`);
                                        io.emit('play_sound_alert', { soundUrl, volume: 100 });
                                    }
                                }
                            } catch (e) {
                                console.error("Error triggering immediate gift sound:", e);
                            }
                        }
                    }
                }

                if (data.repeatEnd == 1 || !data.repeatable) {
                    const giftIdStr = String(data.giftId);
                    const prevMax = dinamicaGiftCounts[msgId] || 0;
                    if (repeatCount > prevMax) {
                        const increment = repeatCount - prevMax;
                        // Actualiza estrictamente el widget de dinámicas independiente sin tocar recetas
                        updateDinamicaGoalProgress('gift', increment, giftIdStr);
                        dinamicaGiftCounts[msgId] = repeatCount;
                        
                        if (Object.keys(dinamicaGiftCounts).length > 1000) {
                            const keys = Object.keys(dinamicaGiftCounts);
                            delete dinamicaGiftCounts[keys[0]];
                        }
                    }
                }

                io.emit('overlay_trigger', {
                    type: 'gift',
                    giftId: data.giftId,
                    giftName: data.giftName,
                    sender: data.nickname,
                    repeatCount: data.repeatCount,
                    diamondCount: data.diamondCount,
                    extendedGiftInfo: data.extendedGiftInfo
                });

                if (uniqueId && coins > 0) {
                    const prevMax = rankingsGiftCounts[msgId] || 0;
                    if (repeatCount > prevMax) {
                        const increment = repeatCount - prevMax;
                        if (!rankings.gifts[uniqueId]) {
                            rankings.gifts[uniqueId] = { nickname, count: 0, profilePictureUrl: data.profilePictureUrl || '' };
                        } else {
                            if (data.profilePictureUrl) {
                                rankings.gifts[uniqueId].profilePictureUrl = data.profilePictureUrl;
                            }
                        }
                        rankings.gifts[uniqueId].count += (increment * coins);
                        rankingsGiftCounts[msgId] = repeatCount;
                        
                        if (Object.keys(rankingsGiftCounts).length > 1000) {
                            const keys = Object.keys(rankingsGiftCounts);
                            delete rankingsGiftCounts[keys[0]];
                        }
                        
                        updateMvp(uniqueId, nickname);
                        broadcastRankings();
                    }
                }

                // Cache gift metadata for the selector modal
                let iconUrl = '';
                if (data.giftIcon) {
                    if (typeof data.giftIcon === 'string') {
                        iconUrl = data.giftIcon;
                    } else if (data.giftIcon.url_list && data.giftIcon.url_list[0]) {
                        iconUrl = data.giftIcon.url_list[0];
                    } else if (data.giftIcon.url) {
                        iconUrl = data.giftIcon.url;
                    }
                }
                if (data.giftName && (!chatbotSettings.giftMetadata || !chatbotSettings.giftMetadata[data.giftName])) {
                    if (!chatbotSettings.giftMetadata) {
                        chatbotSettings.giftMetadata = {};
                    }
                    chatbotSettings.giftMetadata[data.giftName] = {
                        name: data.giftName,
                        coins: data.diamondCount || 1,
                        iconUrl: iconUrl
                    };
                    try {
                        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
                        io.emit('chatbot_settings_updated', chatbotSettings);
                    } catch (err) {
                        console.error('Error saving cached gift metadata:', err);
                    }
                }

                // Auto-registro de nuevo regalo en gifts_mapping.json si no existe
                if (data.giftId) {
                    const mappingFilePath = GIFTS_MAPPING_FILE;
                    try {
                        let mapping = {};
                        let readSuccess = true;
                        if (fs.existsSync(mappingFilePath)) {
                            const raw = fs.readFileSync(mappingFilePath, 'utf8').trim();
                            if (raw) {
                                try {
                                    mapping = JSON.parse(raw);
                                } catch (parseErr) {
                                    console.error('[Auto-Registro Regalo] Error parsing gifts_mapping.json:', parseErr);
                                    readSuccess = false;
                                }
                            }
                        }
                        if (readSuccess) {
                            const giftIdStr = String(data.giftId);
                            if (!mapping[giftIdStr]) {
                                const giftImage = data.giftName ? `${data.giftName.toLowerCase().replace(/\s+/g, '_')}.png` : `${giftIdStr}.png`;
                                mapping[giftIdStr] = {
                                    name: data.giftName || `Gift ${giftIdStr}`,
                                    coins: data.diamondCount || 1,
                                    image: giftImage
                                };
                                fs.writeFileSync(mappingFilePath, JSON.stringify(mapping, null, 2), 'utf8');
                                console.info(`[Auto-Registro Regalo] Nuevo regalo registrado: ${data.giftName} (ID: ${giftIdStr})`);
                                // Propagar a catálogo espejo de Dinámicas
                                syncMirrorCatalogs(giftIdStr, mapping[giftIdStr]);
                                // Notificar a los clientes: cerebro actualizado
                                io.emit('initMetas', mapping);
                                // Notificar a los clientes: espejo de metas actualizado
                                io.emit('initGoalsCatalog', goalsCatalog);
                            }
                        }
                    } catch (err) {
                        console.error('Error auto-registrando regalo en gifts_mapping.json:', err);
                    }
                }

                // Blacklist check
                const blacklist = (chatbotSettings.ignoreUserList || []).map(u => u.toLowerCase().trim());
                if (!blacklist.includes(uniqueId)) {
                    const giftKey = `${uniqueId}_${(data.giftName || '').toLowerCase().trim()}`;
                    
                    let prevCount = 0;
                    if (!giftTTSAccumulator[giftKey]) {
                        console.log(`[TTS-Debounce] Starting new gift accumulator for key: ${giftKey}`);
                        giftTTSAccumulator[giftKey] = {
                            data: data,
                            maxCount: 0,
                            timer: null
                        };
                    } else {
                        prevCount = giftTTSAccumulator[giftKey].maxCount;
                    }
                    
                    const currentCount = Math.max(data.repeatCount || 1, prevCount);
                    giftTTSAccumulator[giftKey].maxCount = currentCount;
                    giftTTSAccumulator[giftKey].data = data;
                    
                    const increment = currentCount - prevCount;
                    if (increment > 0) {
                        const prevMax = goalGiftCounts[msgId] || 0;
                        if (currentCount > prevMax) {
                            const actualIncrement = currentCount - prevMax;
                            const giftValue = getGiftCoinValue(data);
                            const coinIncrement = actualIncrement * giftValue;
                            updateGoalProgress('gift', coinIncrement, data.giftName);
                            goalGiftCounts[msgId] = currentCount;
                            
                            if (Object.keys(goalGiftCounts).length > 1000) {
                                const keys = Object.keys(goalGiftCounts);
                                delete goalGiftCounts[keys[0]];
                            }
                        }
                    }
                    
                    if (giftTTSAccumulator[giftKey].timer) {
                        clearTimeout(giftTTSAccumulator[giftKey].timer);
                        giftTTSAccumulator[giftKey].timer = null;
                    }
                    
                    const isRepeatEnd = data.repeatEnd === true || data.repeatEnd === 1 || data.repeatEnd === '1';
                    
                    if (isRepeatEnd) {
                        const finalGift = giftTTSAccumulator[giftKey];
                        delete giftTTSAccumulator[giftKey];
                        if (finalGift) {
                            console.log(`[TTS-Debounce] repeatEnd detected for key: ${giftKey}. Processing final count: ${finalGift.maxCount}`);
                            processAccumulatedGift(finalGift.data, finalGift.maxCount);
                        }
                    } else {
                        console.log(`[TTS-Debounce] Intermediate count for key: ${giftKey} (${currentCount}), waiting for repeatEnd...`);
                        giftTTSAccumulator[giftKey].timer = setTimeout(() => {
                            const finalGift = giftTTSAccumulator[giftKey];
                            delete giftTTSAccumulator[giftKey];
                            if (finalGift) {
                                console.log(`[TTS-Debounce] Fallback timeout reached for key: ${giftKey}. Processing final count: ${finalGift.maxCount}`);
                                processAccumulatedGift(finalGift.data, finalGift.maxCount);
                            }
                        }, 2000); // 2 seconds fallback
                    }
                }
            }

            if (eventType === 'like') {
                const uniqueId = (data.uniqueId || '').toLowerCase();
                const nickname = data.nickname || data.uniqueId;
                const count = data.likeCount || 1;
                
                // Update dynamic goals progress
                updateGoalProgress('likes', count);
                updateDinamicaGoalProgress('likes', count);
                
                if (uniqueId) {
                    if (!rankings.likes[uniqueId]) {
                        rankings.likes[uniqueId] = { nickname, count: 0, profilePictureUrl: data.profilePictureUrl || '' };
                    } else {
                        if (data.profilePictureUrl) {
                            rankings.likes[uniqueId].profilePictureUrl = data.profilePictureUrl;
                        }
                    }
                    rankings.likes[uniqueId].count += count;
                    
                    updateMvp(uniqueId, nickname);
                    broadcastRankings();
                }

                // Blacklist & Banned Username check
                const blacklist = (chatbotSettings.ignoreUserList || []).map(u => u.toLowerCase().trim());
                if (!blacklist.includes(uniqueId) && !isBannedText(uniqueId, true) && !isBannedText(nickname, true)) {
                    // Trigger Sound Alerts for Likes
                    if (chatbotSettings.soundAlertsEnabled && chatbotSettings.soundAlerts) {
                        chatbotSettings.soundAlerts.forEach(alert => {
                            if (alert.enabled && alert.type === 'like') {
                                const milestone = alert.cantidad || 100;
                                const userLikes = rankings.likes[uniqueId] ? rankings.likes[uniqueId].count : 0;
                                const previousLikes = userLikes - count;
                                if (milestone > 0 && Math.floor(userLikes / milestone) > Math.floor(previousLikes / milestone)) {
                                    triggerSoundAlert(alert);
                                }
                            }
                        });
                    }

                    // Cloud TTS milestone check
                    if (chatbotSettings.readLikesMilestoneEnabled) {
                        const milestone = chatbotSettings.likesMilestoneValue || 100;
                        const userLikes = rankings.likes[uniqueId] ? rankings.likes[uniqueId].count : 0;
                        const previousLikes = userLikes - count;
                        if (milestone > 0 && Math.floor(userLikes / milestone) > Math.floor(previousLikes / milestone)) {
                            const action = chatbotSettings.likeAction || 'read';
                            const soundFile = chatbotSettings.likeSound;

                            // Play sound if action is 'sound' or 'both'
                            if ((action === 'sound' || action === 'both') && soundFile) {
                                io.emit('play_sound_alert', { soundUrl: soundFile, volume: 100 });
                            }

                            // Play TTS if action is 'read' or 'both'
                            if (action === 'read' || action === 'both') {
                                let ttsText = "";
                                const customPhrase = chatbotSettings.thankYouLikePhrase;
                                if (customPhrase && customPhrase.trim() !== "") {
                                    const displayName = stripEmojis(nickname);
                                    ttsText = formatCustomPhrase(customPhrase, 'like', displayName, '', milestone);
                                } else {
                                    const theme = chatbotSettings.themeName || 'neutral';
                                    if (theme === 'naya') {
                                        ttsText = `¡Muchísimas gracias @${nickname} por esos ${milestone} corazones en la pantalla de Naya!`;
                                    } else if (theme === 'majo') {
                                        ttsText = `¡Gracias por esos ${milestone} likes a la telaraña de Majo, @${nickname}!`;
                                    } else {
                                        ttsText = `¡Gracias @${nickname} por enviar ${milestone} likes a la transmisión!`;
                                    }
                                }
                                speakCustomTts(ttsText);
                            }
                        }
                    }
                }
            }

            if (eventType === 'follow') {
                processFollowEvent(data);
            }

            if (eventType === 'share') {
                processShareEvent(data);
            }

            if (eventType === 'social') {
                const displayType = (data.displayType || '').toLowerCase();
                const actionCode = parseInt(data.action) || 0;
                
                const isFollow = displayType.includes('follow') || actionCode === 1;
                const isShare = displayType.includes('share') || actionCode === 3 || actionCode === 4;

                if (isFollow) {
                    processFollowEvent(data);
                } else if (isShare) {
                    processShareEvent(data);
                }
            }
            
            if (eventType === 'linkMicBattle') {
                const hasRewards = checkBattleRewardsRecursive(data);
                const activeBoosters = detectActiveBoosters(data);
                
                // Append parsed properties to the data payload so the panel/overlays can read them directly
                data.hasRewards = hasRewards;
                data.activeBoosters = activeBoosters;
                
                const battleId = data.battleId || 'current';
                
                if (hasRewards && lastAnnouncedBattleId !== battleId) {
                    lastAnnouncedBattleId = battleId;
                    console.info(`[BATALLA] ¡Pozo de premios detectado! ID: ${battleId}`);
                    const phrase = "¡Atención! En esta batalla regalarán potenciadores como guantes al finalizar. ¡Apoyemos con todo para ganar esas recompensas!";
                    speakCustomTts(phrase, true);
                    
                    io.emit('overlay_trigger', {
                        type: 'battle_rewards_available',
                        message: '¡RECOMPENSAS DE BATALLA ACTIVAS!'
                    });
                }
                
                if (activeBoosters.length > 0) {
                    activeBoosters.forEach(booster => {
                        const boosterKey = `${battleId}_${booster}`;
                        if (!announcedBoosters.has(boosterKey)) {
                            announcedBoosters.add(boosterKey);
                            if (announcedBoosters.size > 200) {
                                const first = announcedBoosters.values().next().value;
                                announcedBoosters.delete(first);
                            }
                            
                            console.info(`[BATALLA] Potenciador detectado en linkMicBattle: ${booster}`);
                            let phrase = `¡Se ha activado el potenciador ${booster} en la batalla!`;
                            if (booster.includes('Guante')) {
                                phrase = "¡Guante activo! Los regalos multiplican sus puntos por dos durante los próximos 30 segundos. ¡Es momento de apoyar!";
                                io.emit('overlay_trigger', {
                                    type: 'glove_activated',
                                    duration: 30
                                });
                            } else if (booster.includes('Niebla')) {
                                phrase = "¡Cuidado! Se ha activado la niebla en la batalla. El marcador del oponente está oculto.";
                            }
                            speakCustomTts(phrase, true);
                        }
                    });
                }

                io.emit('overlay_trigger', {
                    type: 'battle_event',
                    data: data
                });
            }

            if (eventType === 'linkMicArmies') {
                const activeBoosters = detectActiveBoosters(data);
                data.activeBoosters = activeBoosters;
                
                const battleId = data.battleId || 'current';
                
                if (activeBoosters.length > 0) {
                    activeBoosters.forEach(booster => {
                        const boosterKey = `${battleId}_${booster}`;
                        if (!announcedBoosters.has(boosterKey)) {
                            announcedBoosters.add(boosterKey);
                            if (announcedBoosters.size > 200) {
                                const first = announcedBoosters.values().next().value;
                                announcedBoosters.delete(first);
                            }
                            
                            console.info(`[BATALLA] Potenciador detectado en linkMicArmies: ${booster}`);
                            let phrase = `¡Se ha activado el potenciador ${booster} en la batalla!`;
                            if (booster.includes('Guante')) {
                                phrase = "¡Guante activo! Los regalos multiplican sus puntos por dos durante los próximos 30 segundos. ¡Es momento de apoyar!";
                                io.emit('overlay_trigger', {
                                    type: 'glove_activated',
                                    duration: 30
                                });
                            }
                            speakCustomTts(phrase, true);
                        }
                    });
                }
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
    
    socket.on('ping_latency', (callback) => {
        if (typeof callback === 'function') callback();
    });
    
    // Send initial gift goals from mapping file and in-memory progress
    const mappingFilePath = GIFTS_MAPPING_FILE;
    let mappingData = {};
    try {
        if (fs.existsSync(mappingFilePath)) {
            const raw = fs.readFileSync(mappingFilePath, 'utf8');
            mappingData = JSON.parse(raw);
        }
    } catch (e) {
        mappingData = {};
    }
    for (const giftId in mappingData) {
        if (!giftMetasProgress[giftId]) {
            const coins = mappingData[giftId].coins || 1;
            let target = 100;
            if (coins >= 1000) target = 1;
            else if (coins >= 100) target = 5;
            else if (coins >= 10) target = 10;
            else if (coins >= 5) target = 20;

            giftMetasProgress[giftId] = {
                current: 0,
                target: target
            };
        }
        mappingData[giftId].current = giftMetasProgress[giftId].current;
        mappingData[giftId].target = giftMetasProgress[giftId].target;
    }
    socket.emit('initMetas', mappingData);
    socket.emit('initSoundsConfig', soundsConfig);
    // Enviar catálogo espejo de Dinámicas al cliente
    socket.emit('initGoalsCatalog', goalsCatalog);

    // Send initial dynamic goals for dinamicas widget
    socket.emit('initDinamicas', dinamicasConfig);

    // Send initial recetasConfig on connection
    socket.emit('initReceta', recetasConfig);

    // Send current TikTok connection state on connection
    if (tiktokLiveConnection) {
        socket.emit('system', { type: 'connected', message: `Conectado a @${chatbotSettings.tiktokUsername}` });
        socket.emit('tiktok_connected', { username: chatbotSettings.tiktokUsername, avatarUrl: currentCreatorAvatar });
    } else {
        socket.emit('system', { type: 'error', message: 'DESCONECTADO' });
        socket.emit('tiktok_disconnected');
    }
    
    // Send current chatbot settings on connection
    socket.emit('chatbot_settings_updated', chatbotSettings);
    socket.emit('initGlobalWidgetStyles', chatbotSettings.globalWidgetStyles || {
        fontFamily: "Outfit",
        borderThickness: 2,
        borderColor: "#00f0ff",
        bgColor: "#0f0a19",
        bgOpacity: 0,
        textScale: 100
    });
    
    // Send active goal for meta-widget on connection
    const activeGoal = (chatbotSettings.goals || []).find(g => g.type === 'gift' && g.enabled);
    if (activeGoal) {
        socket.emit('meta_goal_updated', {
            giftName: activeGoal.giftName,
            current: activeGoal.current,
            target: activeGoal.target
        });
    }
    
    socket.emit('app_version', packageJson.version);
    socket.emit('rankings_updated', getTopRankings());
    socket.emit('session_stats_updated', {
        diamonds: totalSessionDiamonds,
        likes: totalSessionLikes,
        viewers: totalSessionViewers
    });

    // Send local IPs on connection
    socket.emit('local_ips', getLocalIPs());

    // Send Spotify queue and votes on connection
    socket.emit('spotify_queue_updated', spotifyQueue);
    socket.emit('spotify_votes_updated', { votes: spotifyVoteSkips.size, limit: chatbotSettings.spotifyVoteSkipLimit });
    socket.emit('spotify_monetized_users_updated', getMonetizedUsersData());
    socket.emit('remote_config_updated', remoteConfig);

    // Handle updates check request
    socket.on('check_for_updates', () => {
        console.log('Comprobación manual de actualizaciones solicitada por el panel...');
        if (global.manualCheckForUpdates) {
            global.manualCheckForUpdates();
        } else {
            console.warn('global.manualCheckForUpdates no está configurado.');
        }
    });

    // Relay manual control commands from the panel to the overlay
    socket.on('manual_control', (data) => {
        if (data) {
            if (data.action === 'vs_update') {
                recetasConfig.title = data.title;
                recetasConfig.items = data.items;
                try {
                    fs.writeFileSync(RECETAS_CONFIG_FILE, JSON.stringify(recetasConfig, null, 2), 'utf8');
                } catch (err) {
                    console.error('Error saving recetas_config.json:', err);
                }
                io.emit('initReceta', recetasConfig);
            } else if (data.action === 'vs_show') {
                recetasConfig.visible = true;
                try {
                    fs.writeFileSync(RECETAS_CONFIG_FILE, JSON.stringify(recetasConfig, null, 2), 'utf8');
                } catch (err) {
                    console.error('Error saving recetas_config.json:', err);
                }
                io.emit('initReceta', recetasConfig);
            } else if (data.action === 'vs_hide') {
                recetasConfig.visible = false;
                try {
                    fs.writeFileSync(RECETAS_CONFIG_FILE, JSON.stringify(recetasConfig, null, 2), 'utf8');
                } catch (err) {
                    console.error('Error saving recetas_config.json:', err);
                }
                io.emit('initReceta', recetasConfig);
            } else if (data.action === 'vs_reset') {
                recetasConfig = {
                    title: "RECETA DEL DÍA: PASTEL DE FRESAS",
                    items: [
                        { name: "Fresas Frescas 10 tazas" },
                        { name: "Harina de Trigo 300g" },
                        { name: "Azúcar Morena 150g" },
                        { name: "Esencia de Vainilla 2 cdas" }
                    ],
                    visible: true
                };
                try {
                    fs.writeFileSync(RECETAS_CONFIG_FILE, JSON.stringify(recetasConfig, null, 2), 'utf8');
                } catch (err) {
                    console.error('Error saving recetas_config.json:', err);
                }
                io.emit('initReceta', recetasConfig);
            }
        }
        io.emit('overlay_command', data);
    });

    // Toggle active state of widgets
    socket.on('toggle_widget', (data) => {
        const { widget, active } = data;
        if (widget && chatbotSettings.widgets && chatbotSettings.widgets[widget]) {
            chatbotSettings.widgets[widget].active = !!active;
            
            try {
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
                io.emit('widget_status_changed', { widget, active: chatbotSettings.widgets[widget].active });
                console.info(`[Widget Control] Widget '${widget}' active state changed to: ${active}`);
            } catch (err) {
                console.error('Error saving settings during toggle_widget:', err);
            }
        }
    });

    // Update coordinates (relative positioning) of widgets
    socket.on('update_widget_position', (data) => {
        const { widget, x, y, width, height } = data;
        if (widget && chatbotSettings.widgets && chatbotSettings.widgets[widget]) {
            chatbotSettings.widgets[widget].x = Number(x);
            chatbotSettings.widgets[widget].y = Number(y);
            if (width !== undefined) chatbotSettings.widgets[widget].width = Number(width);
            if (height !== undefined) chatbotSettings.widgets[widget].height = Number(height);
            
            try {
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
                io.emit('widget_position_changed', { 
                    widget, 
                    x: chatbotSettings.widgets[widget].x, 
                    y: chatbotSettings.widgets[widget].y,
                    width: chatbotSettings.widgets[widget].width,
                    height: chatbotSettings.widgets[widget].height
                });
                console.info(`[Widget Control] Widget '${widget}' layout updated to: X=${x}%, Y=${y}%, W=${width}%, H=${height}%`);
            } catch (err) {
                console.error('Error saving settings during update_widget_position:', err);
            }
        }
    });

    // Add custom sound alert - SÓLO MULTIMEDIA
    socket.on('add_sound_alert', (data) => {
        const { giftId, name, coins, image } = data;
        try {
            soundsConfig[giftId] = {
                id: giftId,
                name: name,
                coins: coins,
                image: image,
                sound: ""
            };
            fs.writeFileSync(SOUNDS_CONFIG_FILE, JSON.stringify(soundsConfig, null, 2), 'utf8');
            io.emit('initSoundsConfig', soundsConfig); // Alerta exclusiva a la tabla multimedia
            console.info(`[Multimedia] Alerta de sonido creada para el regalo: ${name} (ID: ${giftId})`);
        } catch (e) {
            console.error("Error adding sound alert to sounds_config.json:", e);
        }
    });

    // Update gift sound assignment inside sounds_config.json
    socket.on('update_gift_sound', (data) => {
        const { giftId, sound } = data;
        try {
            if (soundsConfig[giftId]) {
                soundsConfig[giftId].sound = sound || "";
                fs.writeFileSync(SOUNDS_CONFIG_FILE, JSON.stringify(soundsConfig, null, 2), 'utf8');
                console.info(`[Update Gift Sound] Updated gift ${giftId} sound to: ${sound}`);
                io.emit('initSoundsConfig', soundsConfig);
            }
        } catch (e) {
            console.error("Error updating gift sound in sounds_config.json:", e);
        }
    });

    // Remove sound alert
    socket.on('remove_sound_alert', (data) => {
        const { giftId } = data;
        try {
            if (soundsConfig[giftId]) {
                delete soundsConfig[giftId];
                fs.writeFileSync(SOUNDS_CONFIG_FILE, JSON.stringify(soundsConfig, null, 2), 'utf8');
                console.info(`[Remove Sound Alert] Removed sound alert for gift ${giftId}`);
                io.emit('initSoundsConfig', soundsConfig);
            }
        } catch (e) {
            console.error("Error removing sound alert from sounds_config.json:", e);
        }
    });

    // Add custom dynamic goal
    socket.on('add_dynamic_goal', (data) => {
        const { type, giftId, giftName, title, target } = data;
        try {
            const goalId = 'goal_' + Date.now();
            let newGoal = {
                id: goalId,
                type: type,
                title: title,
                target: Number(target) || 100,
                current: 0,
                enabled: true
            };
            if (type === 'gift') {
                newGoal.giftId = giftId;
                newGoal.giftName = giftName;
                
                // Get image and coins from gifts_mapping.json (CEREBRO) if available
                if (fs.existsSync(GIFTS_MAPPING_FILE)) {
                    const mapping = JSON.parse(fs.readFileSync(GIFTS_MAPPING_FILE, 'utf8'));
                    if (mapping[giftId] && mapping[giftId].image) {
                        newGoal.image = mapping[giftId].image;
                        newGoal.coins = mapping[giftId].coins;
                    }
                }
                if (!newGoal.image) {
                    newGoal.image = `${(giftName || '').toLowerCase().replace(/\s+/g, '_')}.png`;
                }
            }
            dinamicasConfig.push(newGoal);
            fs.writeFileSync(DINAMICAS_CONFIG_FILE, JSON.stringify(dinamicasConfig, null, 2), 'utf8');
            emitDinamicasData();
            console.info(`[Add Dynamic Goal] Added goal: ${title} (${type})`);
        } catch (e) {
            console.error("Error adding dynamic goal:", e);
        }
    });

    // Remove custom dynamic goal
    socket.on('remove_dynamic_goal', (data) => {
        const { goalId } = data;
        try {
            dinamicasConfig = dinamicasConfig.filter(g => g.id !== goalId);
            fs.writeFileSync(DINAMICAS_CONFIG_FILE, JSON.stringify(dinamicasConfig, null, 2), 'utf8');
            emitDinamicasData();
            console.info(`[Remove Dynamic Goal] Removed goal: ${goalId}`);
        } catch (e) {
            console.error("Error removing dynamic goal:", e);
        }
    });

    // Reset progress of all dynamic goals
    socket.on('reset_dynamic_goals', () => {
        try {
            dinamicasConfig.forEach(g => {
                g.current = 0;
            });
            fs.writeFileSync(DINAMICAS_CONFIG_FILE, JSON.stringify(dinamicasConfig, null, 2), 'utf8');
            emitDinamicasData();
            console.info(`[Reset Dynamic Goals] Progress reset for all goals`);
        } catch (e) {
            console.error("Error resetting dynamic goals:", e);
        }
    });

    // Handle chatbot settings updates
    socket.on('update_chatbot_settings', (newSettings) => {
        const oldVolume = chatbotSettings.spotifyVolume;
        
        // Handle AI nested structure merge safely
        const incomingAi = newSettings.ai;
        delete newSettings.ai;
        
        chatbotSettings = { ...chatbotSettings, ...newSettings };
        
        if (incomingAi) {
            chatbotSettings.ai = chatbotSettings.ai || {};
            if (incomingAi.naya) {
                chatbotSettings.ai.naya = { ...chatbotSettings.ai.naya, ...incomingAi.naya };
            }
            if (incomingAi.majo) {
                chatbotSettings.ai.majo = { ...chatbotSettings.ai.majo, ...incomingAi.majo };
            }
        }
        
        if (newSettings.spotifyVolume !== undefined && newSettings.spotifyVolume !== oldVolume) {
            setSpotifyVolume(chatbotSettings.spotifyVolume);
        }
        
        try {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
            if (chatbotSettings.geminiApiKey || chatbotSettings.gemini_api_key) {
                const gKey = (chatbotSettings.geminiApiKey || chatbotSettings.gemini_api_key).trim();
                console.log('[SETTINGS PERSISTED] Gemini Key guardada que termina en:', gKey.slice(-6));
            }
            if (chatbotSettings.cloudTtsApiKey || chatbotSettings.cloud_tts_api_key) {
                const cKey = (chatbotSettings.cloudTtsApiKey || chatbotSettings.cloud_tts_api_key).trim();
                console.log('[SETTINGS PERSISTED] Cloud TTS Key guardada que termina en:', cKey.slice(-6));
            }
            io.emit('chatbot_settings_updated', chatbotSettings);
            io.emit('goals_updated', chatbotSettings.goals);
            
            // Also emit meta_goal_updated for active goal in case it was reset or updated
            const activeGoal = (chatbotSettings.goals || []).find(g => g.type === 'gift' && g.enabled);
            if (activeGoal) {
                io.emit('meta_goal_updated', {
                    giftName: activeGoal.giftName,
                    current: activeGoal.current,
                    target: activeGoal.target
                });
            } else {
                io.emit('meta_goal_updated', null);
            }
        } catch (err) {
            console.error('Error saving chatbot settings:', err);
        }
    });

    // Handle update globalWidgetStyles
    socket.on('updateGlobalWidgetStyles', (styles) => {
        chatbotSettings.globalWidgetStyles = { ...chatbotSettings.globalWidgetStyles, ...styles };
        try {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2));
            io.emit('globalWidgetStylesChanged', chatbotSettings.globalWidgetStyles);
            io.emit('chatbot_settings_updated', chatbotSettings);
            console.info('[Settings] globalWidgetStyles updated and broadcasted:', chatbotSettings.globalWidgetStyles);
        } catch (err) {
            console.error('Error saving globalWidgetStyles:', err);
        }
    });

    // Handle Factory Reset / Clear Cache
    socket.on('clear_cache', () => {
        console.info('[Clear Cache] Petición de limpieza de caché recibida.');
        
        // 1. Desconectar de TikTok Live si está activo
        if (tiktokLiveConnection) {
            try {
                tiktokLiveConnection.removeAllListeners();
                tiktokLiveConnection.disconnect();
            } catch (e) {
                console.error('[Clear Cache] Error desconectando TikTok:', e);
            }
            tiktokLiveConnection = null;
        }

        try {
            // 2. Borrar todos los archivos de configuración (.json y .bak) en el directorio writableDir,
            // excluyendo expresamente la base de datos de regalos (gifts_mapping.json) y sus copias de seguridad.
            const files = fs.readdirSync(writableDir);
            files.forEach(file => {
                const filePath = path.join(writableDir, file);
                try {
                    const stat = fs.statSync(filePath);
                    if (stat.isFile()) {
                        if (file.endsWith('.json') || file.endsWith('.bak') || file.endsWith('.mp3')) {
                            if (file !== 'gifts_mapping.json' && !file.includes('gifts_mapping.json')) {
                                fs.unlinkSync(filePath);
                                console.info(`[Clear Cache] Eliminado archivo de configuración: ${file}`);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`[Clear Cache] Error al procesar archivo ${file}:`, e);
                }
            });

            // 3. Reiniciar los punteros de configuración a valores predeterminados
            SETTINGS_FILE = DEFAULT_SETTINGS_FILE;
            SOUNDS_CONFIG_FILE = DEFAULT_SOUNDS_CONFIG_FILE;
            DINAMICAS_CONFIG_FILE = DEFAULT_DINAMICAS_CONFIG_FILE;
            RECETAS_CONFIG_FILE = DEFAULT_RECETAS_CONFIG_FILE;
            GOALS_CATALOG_FILE = DEFAULT_GOALS_CATALOG_FILE;

            // 5. Recargar y regenerar configs de fábrica desde el template
            const templatePath = path.join(__dirname, 'chatbot_settings.json');
            const templateSettings = readJsonFileSafe(templatePath, {});
            chatbotSettings = { ...templateSettings };
            
            // Forzar guardado del archivo default de fábrica
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(chatbotSettings, null, 2), 'utf8');

            soundsConfig = {};
            fs.writeFileSync(SOUNDS_CONFIG_FILE, JSON.stringify(soundsConfig, null, 2), 'utf8');

            dinamicasConfig = [];
            fs.writeFileSync(DINAMICAS_CONFIG_FILE, JSON.stringify(dinamicasConfig, null, 2), 'utf8');

            const templateRecetasPath = path.join(__dirname, 'recetas_config.json');
            recetasConfig = readJsonFileSafe(templateRecetasPath, {});
            fs.writeFileSync(RECETAS_CONFIG_FILE, JSON.stringify(recetasConfig, null, 2), 'utf8');

            goalsCatalog = {};
            const brainData = readJsonFileSafe(GIFTS_MAPPING_FILE, {});
            Object.entries(brainData).forEach(([gid, gdata]) => {
                goalsCatalog[gid] = { name: gdata.name, coins: gdata.coins, image: gdata.image };
            });
            fs.writeFileSync(GOALS_CATALOG_FILE, JSON.stringify(goalsCatalog, null, 2), 'utf8');

            // Resetear estadísticas de sesión en memoria y disco
            sessionStats = {
                viewers: 0,
                likes: 0,
                diamonds: 0,
                uptime: "00:00:00",
                startedAt: null,
                roomId: ""
            };
            const sessionStatsFile = path.join(__dirname, 'session_stats.json');
            if (fs.existsSync(sessionStatsFile)) {
                fs.unlinkSync(sessionStatsFile);
            }

            console.info('[Clear Cache] Caché borrada y configuración reiniciada con éxito.');

            // 6. Notificar al cliente que la limpieza ha finalizado para que se recargue
            socket.emit('cache_cleared', { success: true });

        } catch (err) {
            console.error('[Clear Cache] Error durante el proceso de limpieza:', err);
            socket.emit('cache_cleared', { success: false, error: err.message });
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
            await synthesizeSpeech(text, voiceName || 'es-CO-SalomeNeural', rateStr, pitchStr, tempFile);
            if (fs.existsSync(tempFile)) {
                let audioBuffer = fs.readFileSync(tempFile);
                let base64Audio = audioBuffer.toString('base64');
                socket.emit('play_tts_audio', { base64Audio, playLocation: 'panel' });
                fs.unlinkSync(tempFile);
                
                // Clear references immediately to free RAM
                audioBuffer = null;
                base64Audio = null;
                if (global.gc) {
                    try { global.gc(); } catch (e) {}
                }
            }
        } catch (error) {
            console.error('Error testing Edge/Gemini TTS:', error);
            socket.emit('test_tts_error', { message: error.message });
            if (fs.existsSync(tempFile)) {
                try { fs.unlinkSync(tempFile); } catch(e) {}
            }
        }
    });

    socket.on('get_chatbot_settings', () => {
        socket.emit('chatbot_settings_updated', chatbotSettings);
    });

    socket.on('get_viewer_log', () => {
        socket.emit('viewer_log_updated', Object.values(sessionViewers));
    });

    // Handle disconnect tiktok request
    socket.on('disconnect_tiktok', () => {
        console.log('Desconectando de TikTok...');
        try {
            saveViewerSessionHistory();
        } catch (e) {}
        sessionViewers = {};
        io.emit('viewer_log_updated', []);
        
        if (tiktokLiveConnection) {
            try {
                tiktokLiveConnection.removeAllListeners();
                tiktokLiveConnection.disconnect();
            } catch (e) {
                console.error('Error disconnecting tiktok webcast:', e);
            }
            tiktokLiveConnection = null;
        }
        
        // Reset and clear persisted session stats
        totalSessionDiamonds = 0;
        totalSessionLikes = 0;
        totalSessionViewers = 0;
        currentRoomId = '';
        try {
            const statsFile = path.join(__dirname, 'session_stats.json');
            if (fs.existsSync(statsFile)) {
                fs.unlinkSync(statsFile);
            }
        } catch (e) {}
        broadcastSessionStats();

        io.emit('system', { type: 'error', message: 'DESCONECTADO' });
        io.emit('tiktok_disconnected');
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
            io.emit('system', { type: 'system', message: `Desconectando y cambiando a @${username}...` });
            try {
                connectToTikTok(username);
            } catch (err) {
                console.error('Error during connectToTikTok within change_user:', err);
                io.emit('system', { type: 'error', message: `Fallo al cambiar de usuario: ${err.message}` });
            }
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

    socket.on('clear_ai_queue', () => {
        console.info('[AI Gemini] Memoria y cola de IA vaciadas desde el panel.');
        aiCommandQueue = [];
        aiQueueCounter = 0;
        isAiProcessing = false;
        aiChatHistory = [];
        emitAiQueueUpdate();
        io.emit('system', { type: 'info', message: 'Memoria y cola de la IA borradas correctamente.' });
        io.emit('tiktok_event_raw', {
            eventType: 'ai_info',
            data: { message: 'Memoria, cola e historial de la IA borrados por el usuario.' }
        });
    });

    socket.on('remove_ai_queue_item', (id) => {
        console.info(`[AI Gemini] Removiendo petición de IA de la cola: ${id}`);
        aiCommandQueue = aiCommandQueue.filter(item => item.id !== id);
        emitAiQueueUpdate();
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



    socket.on('clear_monetized_users', () => {
        console.info('Limpieza manual de usuarios premium solicitada.');
        sessionGiftCoins = {};
        emitMonetizedUsersUpdate();  // spotify
        io.emit('system', { type: 'info', message: 'Se han limpiado los créditos y monedas acumulados de la sesión.' });
    });

    socket.on('reset_session_rankings', () => {
        console.info('Reinicio manual de rankings de sesión solicitado.');
        rankings = { likes: {}, gifts: {}, mvp: {} };
        broadcastRankings();
        io.emit('system', { type: 'info', message: 'Se han reiniciado los rankings de la sesión.' });
    });



    // Simulated TikTok events handler for testing
    socket.on('simulate_tiktok_event', (data) => {
        const { eventType, eventData } = data;
        console.log(`[Simulador] Recibido evento simulado: ${eventType}`, eventData);
        
        if (eventType === 'gift' && eventData) {
            const uniqueId = (eventData.uniqueId || '').toLowerCase().trim();
            const giftId = String(eventData.giftId);
            const repeatCount = parseInt(eventData.repeatCount) || 1;
            const now = Date.now();

            if (!lastProcessedGift[uniqueId]) {
                lastProcessedGift[uniqueId] = {};
            }
            const last = lastProcessedGift[uniqueId][giftId];
            if (last) {
                const timeDiff = now - last.timestamp;
                if (timeDiff < 5000) {
                    if (repeatCount <= last.repeatCount) {
                        console.log(`[Deduplicación Simulador] Ignorando duplicado estricto para @${uniqueId} (Clave: ${giftId}, diferencia: ${timeDiff}ms, Count: ${repeatCount} <= ${last.repeatCount})`);
                        return;
                    }
                }
            }
            lastProcessedGift[uniqueId][giftId] = { repeatCount, timestamp: now };
        }
        
        // Broadcast raw event to overlay/panel
        io.emit('tiktok_event_raw', { eventType, data: eventData });

        if (eventType === 'chat') {
            handleCloudTTS(eventData);
            handleSpotifyChatCommand(eventData);
            handleAiChatCommand(eventData);
        } else if (eventType === 'gift') {
            const uniqueId = (eventData.uniqueId || '').toLowerCase();
            const nickname = eventData.nickname || eventData.uniqueId;
            const coins = eventData.diamondCount || 0;
            const repeatCount = eventData.repeatCount || 1;
            const totalCoins = coins * repeatCount;

            // Update Dynamic Goal Progress
            updateDinamicaGoalProgress('gift', repeatCount, String(eventData.giftId));
            updateGoalProgress('gift', totalCoins, eventData.giftName);

            // Update rankings
            if (uniqueId && coins > 0) {
                if (!rankings.gifts[uniqueId]) {
                    rankings.gifts[uniqueId] = { nickname, count: 0 };
                }
                rankings.gifts[uniqueId].count += totalCoins;
                updateMvp(uniqueId, nickname);
                broadcastRankings();
            }

            // Emit to overlay
            io.emit('overlay_trigger', {
                type: 'gift',
                giftId: eventData.giftId,
                giftName: eventData.giftName,
                sender: nickname,
                repeatCount: repeatCount,
                diamondCount: coins,
                extendedGiftInfo: eventData.extendedGiftInfo
            });

            // Process monetization credits
            processAccumulatedGift(eventData, repeatCount);
        }
    });

    socket.on('test_social_rotator', (data) => {
        console.log('[Rotador] Emitiendo evento de prueba de red social:', data);
        io.emit('test_social_rotator', data);
    });

    socket.on('trigger_dynamic_widget_event', (data) => {
        io.emit('trigger_dynamic_widget_event', data);
    });
});

function getEdgeVoiceFallback(voice) {
    let v = voice || 'es-CO-SalomeNeural';
    if (v.includes('es-CO') && v.includes('-B')) return 'es-CO-GonzaloNeural';
    if (v.includes('es-CO')) return 'es-CO-SalomeNeural';
    if (v.includes('es-MX') && v.includes('-B')) return 'es-MX-JorgeNeural';
    if (v.includes('es-MX')) return 'es-MX-DaliaNeural';
    if (v.includes('es-US') && v.includes('-B')) return 'es-US-AlonsoNeural';
    if (v.includes('es-US') && v.includes('-C')) return 'es-US-AlonsoNeural';
    if (v.includes('es-US')) return 'es-US-PalomaNeural';
    if (v.includes('es-ES') && v.includes('-B')) return 'es-ES-AlvaroNeural';
    if (v.includes('es-ES')) return 'es-ES-ElviraNeural';
    if (v.includes('es-AR') && v.includes('-B')) return 'es-AR-TomasNeural';
    if (v.includes('es-AR')) return 'es-AR-ElenaNeural';
    if (v.includes('es-CL') && v.includes('-B')) return 'es-CL-LorenzoNeural';
    if (v.includes('es-CL')) return 'es-CL-CatalinaNeural';
    if (v.includes('Neural') && !v.includes('Neural2')) return v;
    return 'es-CO-SalomeNeural';
}

async function synthesizeSpeech(text, voice, rateStr, pitchStr, tempFile, customStyle = null) {
    const geminiVoices = ["Aoede", "Charon", "Fenrir", "Kore", "Puck", "Achernar"];
    const isGoogleCloudEngine = (chatbotSettings.ttsEngine === "google_cloud" || chatbotSettings.ttsEngine === "gemini" || (voice && voice.includes("Neural2")) || geminiVoices.includes(voice));

    const googleTtsKey = (chatbotSettings.cloudTtsApiKey || chatbotSettings.cloud_tts_api_key || '').trim();

    if (isGoogleCloudEngine && googleTtsKey) {
        try {
            let langCode = "es-US";
            let voiceName = "es-US-Neural2-B";

            if (voice && voice.includes("-")) {
                const parts = voice.split("-");
                if (parts.length >= 2) {
                    langCode = `${parts[0]}-${parts[1]}`;
                }
                voiceName = voice;
            } else if (chatbotSettings.geminiLanguage) {
                langCode = chatbotSettings.geminiLanguage;
                if (langCode === "es-MX") voiceName = "es-MX-Neural2-A";
                else if (langCode === "es-ES") voiceName = "es-ES-Neural2-C";
                else voiceName = "es-US-Neural2-B";
            }

            let speakingRate = 1.0;
            if (typeof rateStr === 'number') {
                speakingRate = rateStr;
            } else if (rateStr && typeof rateStr === 'string') {
                if (rateStr.includes('%')) {
                    const match = rateStr.match(/([+-]?\d+)/);
                    if (match) {
                        const pct = parseInt(match[1], 10);
                        speakingRate = Math.max(0.25, Math.min(4.0, 1.0 + (pct / 100)));
                    }
                } else {
                    const parsed = parseFloat(rateStr);
                    if (!isNaN(parsed)) speakingRate = Math.max(0.25, Math.min(4.0, parsed));
                }
            }

            let pitch = 0.0;
            if (typeof pitchStr === 'number') {
                pitch = pitchStr;
            } else if (pitchStr && typeof pitchStr === 'string') {
                const match = pitchStr.match(/([+-]?\d+(?:\.\d+)?)/);
                if (match) {
                    pitch = Math.max(-20.0, Math.min(20.0, parseFloat(match[1])));
                }
            }

            const cleanTextForVoice = (text || '').trim();

            const requestBody = {
                input: { text: cleanTextForVoice },
                voice: {
                    languageCode: langCode,
                    name: voiceName
                },
                audioConfig: {
                    audioEncoding: "MP3",
                    speakingRate: speakingRate,
                    pitch: pitch
                }
            };

            const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleTtsKey}`;
            console.log(`[CLOUD TTS REQUEST] Key: ...${googleTtsKey.slice(-6)} | Voice: ${voiceName} | Endpoint: texttospeech.googleapis.com`);
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(12000)
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error(`[CLOUD TTS API ERROR] HTTP ${response.status}: ${errText}`);
                throw new Error(`Google Cloud TTS API HTTP ${response.status}: ${errText}`);
            }

            const resData = await response.json();
            if (resData.audioContent) {
                const mp3Buffer = Buffer.from(resData.audioContent, 'base64');
                fs.writeFileSync(tempFile, mp3Buffer);
                return;
            } else {
                throw new Error("No audioContent in Google Cloud TTS response.");
            }
        } catch (googleTtsErr) {
            console.warn(`[Google Cloud TTS Fallback] ${googleTtsErr.message}. Alternando de inmediato a Edge TTS...`);
            const fallbackVoice = getEdgeVoiceFallback(voice);
            const tts = new EdgeTTS({
                voice: fallbackVoice,
                rate: rateStr,
                pitch: pitchStr
            });
            await tts.ttsPromise(text, tempFile);
        }
    } else {
        const fallbackVoice = getEdgeVoiceFallback(voice);
        const tts = new EdgeTTS({
            voice: fallbackVoice,
            rate: rateStr,
            pitch: pitchStr
        });
        await tts.ttsPromise(text, tempFile);
    }
}



server.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://127.0.0.1:${PORT}`);
    loadRemoteConfig();
    updateCobaltApis();
    // Update Cobalt APIs list every 30 minutes
    setInterval(updateCobaltApis, 30 * 60 * 1000);
});
