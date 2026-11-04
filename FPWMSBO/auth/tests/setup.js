const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Ensure tests never connect to production Redis DB
delete process.env.REDIS_HOST;
delete process.env.REDIS_PORT;
delete process.env.REDIS_PASSWORD;

// In-memory Redis mock for tests
jest.mock('../src/db/redis', () => {
    const store = new Map();
    return {
        set: jest.fn(async (key, value, ...args) => {
            store.set(key, value);
            return 'OK';
        }),
        get: jest.fn(async (key) => store.get(key) || null),
        del: jest.fn(async (key) => {
            const deleted = store.delete(key);
            return deleted ? 1 : 0;
        }),
        flushall: jest.fn(async () => {
            store.clear();
            return 'OK';
        }),
        on: jest.fn(),
        __store: store,
    };
});

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGODB_URI = uri;
    process.env.MONGO_URI = uri;
    process.env.JWT_SECRET = "test-jwt-secret";
});

afterEach(async () => {
    if (mongoose.connection.readyState === 1) {
        const collections = mongoose.connection.collections;
        for (const key in collections) {
            await collections[key].deleteMany({});
        }
    }
    const redis = require('../src/db/redis');
    if (redis.flushall) {
        await redis.flushall();
    }
});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongoServer) {
        await mongoServer.stop();
    }
});
