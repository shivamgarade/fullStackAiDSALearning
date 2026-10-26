const request = require('supertest')
const app = require('../app')

describe("GET /",()=>{
    it("should return 200",async()=>{
        const res = await  request(app).get('/');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("message")
    })
})


describe("POST /api/auth/register",()=>{
    it("should return 201",async()=>{
        const res = await request(app).post('/api/auth/register').send({
            username:"test",
            email:"[EMAIL_ADDRESS]",
            password:"password"
        })
        expect(res.statusCode).toBe(201)
        expect(res.body).toHaveProperty("message")
        expect(res.body).toHaveProperty("user")
        expect(res.body.user).toHaveProperty("username")
        expect(res.body.user).toHaveProperty("email")
    })
})