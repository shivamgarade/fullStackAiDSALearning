const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const connectDB = require('../src/db/db');
const userModel = require('../src/models/user.model');
const redis = require('../src/db/redis');

describe('GET /api/auth/logout', () => {
    let user;
    let token;

    beforeAll(async () => {
        await connectDB();
    });

    beforeEach(async () => {
        jest.clearAllMocks();

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

    it('returns 200, clears token cookie, and blacklists token in Redis when token cookie is provided', async () => {
        const res = await request(app)
            .get('/api/auth/logout')
            .set('Cookie', [`token=${token}`]);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('User logged out successfully');

        // Verify cookie is cleared
        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        const tokenCookie = cookies.find((c) => c.startsWith('token='));
        expect(tokenCookie).toBeDefined();
        expect(tokenCookie).toMatch(/(token=;|token= |expires=thu, 01 jan 1970|max-age=0)/i);

        // Verify redis was called to blacklist the token with 24 hours TTL
        expect(redis.set).toHaveBeenCalledTimes(1);
        expect(redis.set).toHaveBeenCalledWith(`blacklist:${token}`, 'true', 24 * 60 * 60);
    });

    it('returns 200 and clears cookie without calling Redis when no token is provided', async () => {
        const res = await request(app)
            .get('/api/auth/logout');

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('User logged out successfully');

        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        const tokenCookie = cookies.find((c) => c.startsWith('token='));
        expect(tokenCookie).toBeDefined();

        expect(redis.set).not.toHaveBeenCalled();
    });

    it('blacklists the specific token provided in cookie', async () => {
        const customToken = 'custom_test_token_123';

        const res = await request(app)
            .get('/api/auth/logout')
            .set('Cookie', [`token=${customToken}`]);

        expect(res.status).toBe(200);
        expect(redis.set).toHaveBeenCalledWith(`blacklist:${customToken}`, 'true', 86400);
    });
});
