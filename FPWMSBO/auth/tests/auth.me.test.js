const request = require('supertest');
const app = require('../src/app');
const connectDB = require('../src/db/db');
const userModel = require('../src/models/user.model');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

describe('GET /api/auth/me', () => {
    let user;
    let token;

    beforeAll(async () => {
        await connectDB();
    });

    beforeEach(async () => {
        user = await userModel.create({
            username: 'john_doe',
            email: 'john@example.com',
            password: 'hashedPassword123!',
            fullName: { firstName: 'John', lastName: 'Doe' },
            role: 'user',
        });

        token = jwt.sign(
            {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
            },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );
    });

    it('returns 200 with user profile (without password) when valid token is provided in cookie', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Cookie', [`token=${token}`]);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('user');
        expect(res.body.user._id).toBe(user._id.toString());
        expect(res.body.user.username).toBe(user.username);
        expect(res.body.user.email).toBe(user.email);
        expect(res.body.user.fullName).toEqual({
            firstName: 'John',
            lastName: 'Doe',
        });
        expect(res.body.user.password).toBeUndefined();
    });

    it('returns 200 with user profile when valid token is provided in Authorization header', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('user');
        expect(res.body.user.email).toBe('john@example.com');
        expect(res.body.user.password).toBeUndefined();
    });

    it('returns 401 if no authentication token is provided', async () => {
        const res = await request(app)
            .get('/api/auth/me');

        expect(res.status).toBe(401);
    });

    it('returns 401 if an invalid or malformed token is provided', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Cookie', ['token=invalid_token_value']);

        expect(res.status).toBe(401);
    });

    it('returns 401 if the token has expired', async () => {
        const expiredToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '0s' }
        );

        const res = await request(app)
            .get('/api/auth/me')
            .set('Cookie', [`token=${expiredToken}`]);

        expect(res.status).toBe(401);
    });

    it('returns 401 or 404 if token payload user does not exist in database', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        const orphanToken = jwt.sign(
            { id: nonExistentId },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        const res = await request(app)
            .get('/api/auth/me')
            .set('Cookie', [`token=${orphanToken}`]);

        expect([401, 404]).toContain(res.status);
    });
});

