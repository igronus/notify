import express from 'express';
import {MongoClient,ObjectId} from 'mongodb';
import {v4 as uuidv4} from 'uuid';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

import initializeMongo from './init.js';
initializeMongo();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/notify';
const DB_NAME = MONGODB_URI.split('/').pop();

let dbClient; // Store the MongoDB client instance globally
const clients = new Map();
let notificationsCollection; // Store the collection instance globally

let isNotificating = false;
let notificationsCount = 0;
let startTime = Date.now();

// Middleware to parse JSON request bodies
app.use(express.json());

// --- Startup Logic (Connect to DB, Run Init) ---
async function startServer() {
    try {
        // 1. Establish MongoDB Connection
        console.log("[WebServer] Connecting to MongoDB...");
        dbClient = new MongoClient(MONGODB_URI);
        await dbClient.connect();
        const db = dbClient.db(DB_NAME);
        notificationsCollection = db.collection('notifications');
        console.log(`[WebServer] Connected to MongoDB: ${MONGODB_URI}`);

        // Health check endpoint
        app.get('/health', (req, res) => {
            res.status(200).json({ status: 'healthy', message: 'Notification service is running.' });
        });

        // --- WebSocket Logic ---
        wss.on('connection', function connection(ws, req) {
            // Extract clientId from the URL query string
            // e.g., ws://localhost:3000/notifications?clientId=client_0
            const url = new URL(req.url, `http://${req.headers.host}`); // Create a full URL object
            const clientId = url.searchParams.get('clientId');

            if (!clientId) {
                ws.send(JSON.stringify({ error: 'Missing clientId parameter in WebSocket connection URL.' }));
                ws.close(1008, 'Missing clientId'); // 1008 is "Policy Violation"
                console.warn('[WS] WebSocket connection attempt without clientId. Closed.');
                return;
            }

            console.log(`[WS] Client ${clientId} connected.`);
            clients.set(clientId, ws); // Store the WebSocket instance mapped to its clientId

            // Send a welcome message
            ws.send(JSON.stringify({ type: 'welcome', message: `Connected to notification service for client ${clientId}` }));

            // Handle messages received from the client (if you expect any)
            ws.on('message', function message(msg) {
                console.log(`[WS] Received message from ${clientId}: ${msg}`);
                // Example: client could send a 'pong' or a request for historical data
            });

            // Handle client disconnection
            ws.on('close', (code, reason) => {
                console.log(`[WS] Client ${clientId} disconnected (Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}).`);
                clients.delete(clientId); // Remove client from map on disconnect
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error(`[WS] WebSocket error for ${clientId}:`, error);
            });
        });

        /**
         * Sends a notification message to a specific connected WebSocket client.
         * This function should be called from wherever you trigger notifications (e.g., a cron job checking DB).
         * @param {string} clientId - The ID of the client to send the notification to.
         * @param {object} notificationData - The notification payload to send.
         */
        async function sendNotificationToClient(clientId, notificationData) {
            const clientWs = clients.get(clientId);
            if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'notification', data: notificationData }));
                console.log(`[WS] Pushed notification to client ${clientId}: ${notificationData._id}`);
            }
        }

        async function checkAndSendPendingNotifications() {
            if (isNotificating) {
                return;
            };

            const now = Date.now();
            const BATCH_PROCESS_LIMIT = 1000; // Define how many notifications to process per interval

            // Get the list of currently connected client IDs from your 'clients' Map
            const connectedClientIds = Array.from(clients.keys()); // Convert Map keys (clientIds) to an array

            if (connectedClientIds.length === 0) {
                // console.log("[WS] No clients connected. Skipping notification check."); // Uncomment for debugging
                return; // No need to query DB if no one is connected
            }

            // Find notifications that are PENDING, whose 'time' has passed,
            // AND whose 'clientId' is in the list of currently connected clients.
            const pendingAndDueNotifications = await notificationsCollection.find({
                status: "PENDING",
                time: { $lte: now },
                clientId: { $in: connectedClientIds }
            })
                .limit(BATCH_PROCESS_LIMIT) // Still good to limit the batch size
                .toArray();

            if (pendingAndDueNotifications.length === 0) {
                // console.log("[WS] No pending due notifications for connected clients."); // Uncomment for debugging
                return;
            }

            console.log(`[WS] Found ${pendingAndDueNotifications.length} due notifications for connected clients. Processing...`);

            for (const notification of pendingAndDueNotifications) {
                // sendNotificationToClient already handles the check if clientWs is open,
                // but now we're more confident they should be, due to the $in query.
                await sendNotificationToClient(notification.clientId, notification);

                // Mark notification as SENT or PROCESSED in the database
                await notificationsCollection.updateOne(
                    { _id: notification._id },
                    { $set: { status: "SENT", deliveredAt: new Date() } }
                );
                console.log(`[WS] Notification ${notification._id} marked as SENT.`);
                notificationsCount++;
            }

            isNotificating = false;
        }

        setInterval(checkAndSendPendingNotifications, 100);
        setInterval(printStats, 10000);
        console.log('[WebServer] Started periodic check for pending notifications.');

        // POST /notifications
        // Create a new delayed notification
        app.post('/notifications', async (req, res) => {
            const { clientId, time, text } = req.body;

            if (!clientId || !time || !text) {
                return res.status(400).json({ error: 'Missing required fields: clientId, time, text' });
            }

            // 'time' should be a future Unix timestamp (milliseconds)
            if (typeof time !== 'number' || time <= Date.now()) {
                return res.status(400).json({ error: 'Time must be a future Unix timestamp in milliseconds.' });
            }

            const notification = {
                _id: uuidv4(), // Generate a UUID for the notification ID
                clientId: clientId,
                time: time,
                status: "PENDING", // Initial status
                text: text,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            try {
                const result = await notificationsCollection.insertOne(notification);
                res.status(201).json({
                    message: 'Notification created successfully.',
                    id: result.insertedId,
                    notification: notification // Return the full notification object
                });
            } catch (error) {
                console.error('Error creating notification:', error);
                res.status(500).json({ error: 'Failed to create notification.' });
            }
        });

        // GET /notifications/{id}
        // Retrieve metadata for a specific notification
        app.get('/notifications/:id', async (req, res) => {
            const notificationId = req.params.id;

            try {
                const notification = await notificationsCollection.findOne({ _id: notificationId });

                if (!notification) {
                    return res.status(404).json({ error: 'Notification not found.' });
                }

                res.status(200).json(notification);
            } catch (error) {
                console.error(`Error retrieving notification ${notificationId}:`, error);
                res.status(500).json({ error: 'Failed to retrieve notification.' });
            }
        });

        // Start the web server
        server.listen(PORT, () => {
            console.log(`[WebServer] Server listening on port ${PORT}`);
            console.log(`[WebServer] Access health check at http://localhost:${PORT}/health`);
            console.log(`[WebServer] Use POST http://localhost:${PORT}/notifications to create notifications.`);
            console.log(`[WebServer] Use GET http://localhost:${PORT}/notifications/{id} to retrieve notification metadata.`);
        });

    } catch (error) {
        console.error('[WebServer] Critical error during server startup:', error);
        process.exit(1); // Exit if connection or init fails
    }
}

function printStats()
{
    console.log(`[WebServer] [Statistics] Total notifications: ${notificationsCount}`);
    if (notificationsCount > 0) {
        console.log(`[WS Client] [Statistics] Average speed (per second): ${notificationsCount / ((Date.now() - startTime) / 1000)}`);
    }
}

// Call the async function to start the server
startServer().catch(console.error);

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('[WebServer] SIGINT received. Closing MongoDB connection...');
    printStats();
    if (dbClient) {
        wss.close(); // Close WebSocket server gracefully
        await dbClient.close();
    }
    console.log('[WebServer] MongoDB connection closed. Exiting.');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('[WebServer] SIGTERM received. Closing MongoDB connection...');
    printStats();
    if (dbClient) {
        wss.close(); // Close WebSocket server gracefully
        await dbClient.close();
    }
    console.log('[WebServer] MongoDB connection closed. Exiting.');
    process.exit(0);
});
