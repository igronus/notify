import {MongoClient} from 'mongodb';
import {v4 as uuidv4} from 'uuid';

import initializeMongo from './init.js';

initializeMongo();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/notify';
const DB_NAME = MONGODB_URI.split('/').pop();

const BATCH_SIZE = 10_000;
const NUM_DOCUMENTS_TO_INSERT = 1_000_000; // Default value

async function populateNotifications() {
    let client;
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        const db = client.db(DB_NAME);

        console.log(`[Populate] Connected to MongoDB: ${MONGODB_URI}`);

        console.log(`[Populate] Starting to insert ${NUM_DOCUMENTS_TO_INSERT} notifications in batches of ${BATCH_SIZE}...`);

        const startTime = new Date();
        let documentsInserted = 0;

        while (documentsInserted < NUM_DOCUMENTS_TO_INSERT) {
            const batch = [];
            const currentBatchSize = Math.min(BATCH_SIZE, NUM_DOCUMENTS_TO_INSERT - documentsInserted);

            for (let i = 0; i < currentBatchSize; i++) {
                const notificationId = uuidv4();
                const clientId = `client_${Math.floor(Math.random() * 10000)}`;
                // Use a future time for "delayed" notifications
                // Current time is Tuesday, June 10, 2025 at 5:52:03 PM EEST.
                // Let's set notifications to be sent within the next 30 days from now (June 10, 2025)
                const now = new Date('2025-06-10T17:52:03Z'); // Use a fixed time for consistency in simulation
                const futureTimeMillis = now.getTime() + Math.floor(Math.random() * 86400000 * 30); // Random time in next 30 days

                batch.push({
                    _id: notificationId,
                    clientId: clientId,
                    time: futureTimeMillis, // Future timestamp
                    status: "PENDING",       // New status for delayed notifications
                    text: `Delayed notification for ${clientId} at ${new Date(futureTimeMillis).toISOString()} - message #${documentsInserted + i + 1}`,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }

            try {
                await db.collection('notifications').insertMany(batch, {ordered: false});
                documentsInserted += currentBatchSize;
                console.log(`[Populate] Inserted batch of ${currentBatchSize} documents. Total: ${documentsInserted}`);
            } catch (e) {
                console.error(`[Populate] Error inserting batch. Documents inserted so far: ${documentsInserted}. Error: ${e}`);
                console.error("[Populate] Stopping further insertions due to error.");
                break;
            }
        }

        const endTime = new Date();
        const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

        console.log(`[Populate] --- Insertion Summary ---`);
        console.log(`[Populate] Finished attempting to insert ${NUM_DOCUMENTS_TO_INSERT} documents.`);
        console.log(`[Populate] Total time: ${durationSeconds.toFixed(2)} seconds`);

        if (durationSeconds > 0) {
            console.log(`[Populate] Theoretical insert rate (based on target): ${(NUM_DOCUMENTS_TO_INSERT / durationSeconds).toFixed(2)} documents/second`);
        } else {
            console.log(`[Populate] Theoretical insert rate: Calculation not possible (zero duration).`);
        }

        const finalCount = await db.collection('notifications').countDocuments({});
        console.log(`[Populate] Final document count (verified from DB): ${finalCount}`);

    } catch (error) {
        console.error('[Populate] Error during MongoDB population:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
            console.log("[Populate] MongoDB client closed.");
        }
    }
}

// Directly call the function if this script is executed
populateNotifications().catch(console.error);
