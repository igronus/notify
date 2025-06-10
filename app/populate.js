import {MongoClient} from 'mongodb';
import {v4 as uuidv4} from 'uuid';

import initializeMongo from './init.js';
initializeMongo();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/notify';
const DB_NAME = MONGODB_URI.split('/').pop();

let BATCH_SIZE = 10_000;
let NUM_DOCUMENTS_TO_INSERT = 1_000_000;
let NUM_CLIENTS = 7;
let TIME_START = -300;
let TIME_END = 1800;

function handleNumberArgument(argName, argValue, currentValue, variableName, allowZeroOrNegative = false) {
    const parsedValue = parseInt(argValue, 10);
    if (!isNaN(parsedValue) && (allowZeroOrNegative || parsedValue > 0)) {
        console.log(`[Populate] Overriding ${variableName} to: ${parsedValue}`);
        return parsedValue;
    } else {
        console.warn(`[Populate] Invalid number provided for ${argName}. Using default ${variableName}: ${currentValue}`);
        return currentValue;
    }
}

const args = process.argv.slice(1);
for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    let argName = arg;
    let argValue = null;
    let isEqualsSeparated = false;

    if (arg.includes('=')) {
        isEqualsSeparated = true;
        [argName, argValue] = arg.split('=', 2);
    } else {
        argValue = args[i + 1];
    }

    switch (argName) {
        case '--number':
        case '-n': {
            NUM_DOCUMENTS_TO_INSERT = handleNumberArgument(argName, argValue, NUM_DOCUMENTS_TO_INSERT, 'NUM_DOCUMENTS_TO_INSERT');
            if (!isEqualsSeparated) i++;
            break;
        }
        case '--batch':
        case '-b': {
            BATCH_SIZE = handleNumberArgument(argName, argValue, BATCH_SIZE, 'BATCH_SIZE');
            if (!isEqualsSeparated) i++;
            break;
        }
        case '--clients':
        case '-c': {
            NUM_CLIENTS = handleNumberArgument(argName, argValue, NUM_CLIENTS, 'NUM_CLIENTS');
            if (!isEqualsSeparated) i++;
            break;
        }
        case '--start':
        case '-s': {
            TIME_START = handleNumberArgument(argName, argValue, TIME_START, 'TIME_START', true);
            if (!isEqualsSeparated) i++;
            break;
        }
        case '--end':
        case '-e': {
            TIME_END = handleNumberArgument(argName, argValue, TIME_END, 'TIME_END', true);
            if (!isEqualsSeparated) i++;
            break;
        }
        default:
            console.warn(`[Populate] Unrecognized argument: ${arg}. Skipping.`);
    }
}

if (TIME_END < TIME_START) {
    console.warn(`[Populate] TIME_END (${TIME_END}) cannot be less than TIME_START (${TIME_START}). Adjusting TIME_END to TIME_START.`);
    TIME_END = TIME_START;
}

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

        const now = new Date().getTime();
        const start = now + TIME_START * 1000;
        const end = now + TIME_END * 1000;
        const diff = end - start;
        while (documentsInserted < NUM_DOCUMENTS_TO_INSERT) {
            const batch = [];
            const currentBatchSize = Math.min(BATCH_SIZE, NUM_DOCUMENTS_TO_INSERT - documentsInserted);

            for (let i = 0; i < currentBatchSize; i++) {
                const notificationId = uuidv4();
                const clientId = `client_${Math.floor(Math.random() * NUM_CLIENTS)}`;
                const time = start + Math.floor(Math.random() * diff);

                batch.push({
                    _id: notificationId,
                    clientId: clientId,
                    time: time, // Future timestamp
                    status: "PENDING",       // New status for delayed notifications
                    text: `Delayed notification for ${clientId} at ${new Date(time).toISOString()} - message #${documentsInserted + i + 1}`,
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
