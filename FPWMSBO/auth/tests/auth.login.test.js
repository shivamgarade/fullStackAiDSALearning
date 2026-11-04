const request = require('supertest');
const app = require('../src/app');
const connectDB = require('../src/db/db');
const userModel = require('../src/models/user.model');
const bcrypt = require('bcryptjs');

describe('POST /api/auth/login', () => {
    beforeAll(async () => {
        await connectDB();
    });

    beforeEach(async () => {
        const hash = await bcrypt.hash('Secret123!', 10);
        await userModel.create({
            username: 'john_doe',
            email: 'john@example.com',
            password: hash,
            fullName: { firstName: 'John', lastName: 'Doe' },
        });
    });

    it('logs in successfully and returns 200 with token, user (no password), and cookie', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'john@example.com',
                password: 'Secret123!',
            });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).toHaveProperty('_id');
        expect(res.body.user.email).toBe('john@example.com');
        expect(res.body.user.username).toBe('john_doe');
        expect(res.body.user.password).toBeUndefined();

        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        expect(cookies.some((cookie) => cookie.startsWith('token='))).toBe(true);
    });

    it('returns 401 if password does not match', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'john@example.com',
                password: 'WrongPassword!',
            });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid email or password');
    });

    it('returns 401 if user does not exist', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'nonexistent@example.com',
                password: 'Secret123!',
            });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid email or password');
    });

    it('returns 400 if required fields are missing or invalid', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'not-an-email',
            });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('errors');
    });
});

