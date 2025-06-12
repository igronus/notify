import express from 'express';
import {MongoClient,ObjectId} from 'mongodb';
import {v4 as uuidv4} from 'uuid';

import initializeMongo from './init.js';
initializeMongo();

const app = express();
const PORT = process.env.PORT || 3000;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/notify';
const DB_NAME = MONGODB_URI.split('/').pop();

let dbClient; // Store the MongoDB client instance globally
let notificationsCollection; // Store the collection instance globally

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
        app.listen(PORT, () => {
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

// Call the async function to start the server
startServer().catch(console.error);

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('[WebServer] SIGINT received. Closing MongoDB connection...');
    if (dbClient) {
        await dbClient.close();
    }
    console.log('[WebServer] MongoDB connection closed. Exiting.');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('[WebServer] SIGTERM received. Closing MongoDB connection...');
    if (dbClient) {
        await dbClient.close();
    }
    console.log('[WebServer] MongoDB connection closed. Exiting.');
    process.exit(0);
});
