const request = require('supertest');
const app = require('../src/app');
const connectDB = require('../src/db/db');

// Ensure the server doesn't start; we use app directly

describe('POST /api/auth/register', () => {
    beforeAll(async () => {
        // connectDB uses process.env.MONGO_URI set in setup.js
        await connectDB();
    });

    it('creates a user and returns 201 with user (no password)', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'john_doe',
                email: 'john@example.com',
                password: 'Secret123!',
                fullName: { firstName: 'John', lastName: 'Doe' },
            });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).toHaveProperty('_id');
        expect(res.body.user.email).toBe('john@example.com');
        expect(res.body.user.username).toBe('john_doe');
        expect(res.body.user.password).toBeUndefined();
    });

    it('returns 400 if user with email or username already exists', async () => {
        await request(app)
            .post('/api/auth/register')
            .send({
                username: 'duplicate_user',
                email: 'duplicate@example.com',
                password: 'Secret123!',
                fullName: { firstName: 'Jane', lastName: 'Doe' },
            });

        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'duplicate_user',
                email: 'duplicate@example.com',
                password: 'Secret123!',
                fullName: { firstName: 'Jane', lastName: 'Doe' },
            });

        expect(res.status).toBe(400);
    });

    it('returns 400 if required fields are missing', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'incomplete_user'
            });

        expect(res.status).toBe(400);
    });
});
