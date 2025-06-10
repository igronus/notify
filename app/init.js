import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/notify';
const DB_NAME = MONGODB_URI.split('/').pop();

async function initializeMongo() {
    let client;
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        const db = client.db(DB_NAME);

        console.log(`[Init] Connected to MongoDB: ${MONGODB_URI}`);

        // TODO: move this part to init/001_index task or something
        console.log("[Init] Ensuring 'notifications' collection index...");
        await db.collection('notifications').createIndex(
            { "clientId": 1, "status": 1, "time": 1 },
            { name: "clientId_status_time_idx" }
        );
        console.log("[Init] Index 'clientId_status_time_idx' created or ensured.");
    } catch (error) {
        console.error('[Init] Error during MongoDB initialization:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
            console.log("[Init] MongoDB client closed.");
        }
    }
}

export default initializeMongo;
