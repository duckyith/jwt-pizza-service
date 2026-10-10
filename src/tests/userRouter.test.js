const request = require('supertest');
const app = require('../service');
const { DB, Role } = require('../database/database.js');
const jwt = require('jsonwebtoken');
const config = require('../config.js');

let userToken;
let adminToken;
let userId;
let testUser;

beforeAll(async () => {
  testUser = {
    name: 'coverage user',
    email: `${Math.random().toString(36).substring(2, 12)}@test.com`,
    password: 'test',
  };

  const userRes = await request(app).post('/api/auth').send(testUser);
  userToken = userRes.body.token;
  userId = userRes.body.user.id;

  const admin = await DB.getUser('a@jwt.com');
  adminToken = jwt.sign(admin, config.jwtSecret);
  await DB.loginUser(admin.id, adminToken);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('user can update their own account', async () => {
  const updatedUser = {
    id: userId,
    name: 'updated user',
    email: testUser.email,
    roles: [{ role: Role.Diner }],
  };

  const spy = jest.spyOn(DB, 'updateUser').mockResolvedValue(updatedUser);

  const res = await request(app)
    .put(`/api/user/${userId}`)
    .set('Authorization', `Bearer ${userToken}`)
    .send({ name: 'updated user' });

  expect(res.status).toBe(200);
  expect(res.body.user.name).toBe('updated user');
  expect(res.body.token).toBeTruthy();
  expect(spy).toHaveBeenCalledWith(userId, 'updated user', undefined, undefined);
});

test('non-admin cannot update another user', async () => {
  const spy = jest.spyOn(DB, 'updateUser');

  const res = await request(app)
    .put('/api/user/999999')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ name: 'unauthorized update' });

  expect(res.status).toBe(403);
  expect(res.body.message).toBe('unauthorized');
  expect(spy).not.toHaveBeenCalled();
});

test('admin can update another user', async () => {
  const updatedUser = {
    id: 999999,
    name: 'admin updated user',
    email: 'other@test.com',
    roles: [{ role: Role.Diner }],
  };

  const spy = jest.spyOn(DB, 'updateUser').mockResolvedValue(updatedUser);

  const res = await request(app)
    .put('/api/user/999999')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'admin updated user' });

  expect(res.status).toBe(200);
  expect(res.body.user.name).toBe('admin updated user');
  expect(res.body.token).toBeTruthy();
  expect(spy).toHaveBeenCalledWith(999999, 'admin updated user', undefined, undefined);
});