import WebSocket from 'ws';

let notificationsCount = 0;
let startTime = Date.now();

const WS_SERVER_URL = 'ws://localhost:3000/notifications';
const args = process.argv.slice(2);

let CLIENT_ID;
if (args.length > 0) {
    CLIENT_ID = args[0];
    console.log(`[WS Client] Using client ID from command line: ${CLIENT_ID}`);
} else {
    console.error('[WS Client] Error: No CLIENT_ID specified. Please run with `node client.js <YOUR_CLIENT_ID>`.');
    process.exit(1);
}

const fullWsUrl = `${WS_SERVER_URL}?clientId=${CLIENT_ID}`;
console.log(`[WS Client] Attempting to connect to WebSocket: ${fullWsUrl}`);

const ws = new WebSocket(fullWsUrl);

ws.onopen = () => {
    console.log('[WS Client] Connected to WebSocket server!');
};

ws.onmessage = (event) => {
    console.log('[WS Client] Message from server:', event.data);
    try {
        const message = JSON.parse(event.data);
        if (message.type === 'notification') {
            console.log(`[WS Client] Received NOTIFICATION for ${CLIENT_ID}:`, message.data);
            notificationsCount++;
        } else {
            console.log(`[WS Client] Received non-notification message:`, message);
        }
    } catch (e) {
        console.error('[WS Client] Error parsing message as JSON:', e);
    }
};

ws.onerror = (error) => {
    console.error('[WS Client] WebSocket Error:', error.message);
};

ws.onclose = (event) => {
    console.log(`[WS Client] Disconnected from WebSocket server (Code: ${event.code}, Reason: ${event.reason || 'N/A'}).`);
    if (!event.wasClean) {
        console.warn('[WS Client] Connection was not closed cleanly.');
    }
    printStats();
    // TODO: reconnect on error for example if some variable like dontReconnect is not set within SIGINT
    process.exit(500);
};

process.on('SIGINT', () => {
    console.log('[WS Client] Shutting down...');
    printStats();
    ws.close();
    process.exit();
});

function printStats()
{
    console.log(`[WS Client] [Statistics] Total notifications: ${notificationsCount}`);
    if (notificationsCount > 0) {
        console.log(`[WS Client] [Statistics] Average speed (per second): ${notificationsCount / ((Date.now() - startTime) / 1000)}`);
    }
}
setInterval(printStats, 10000);
