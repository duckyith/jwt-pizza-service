const request = require('supertest');
const app = require('../service');
const { DB } = require('../database/database.js');
const jwt = require('jsonwebtoken');
const config = require('../config.js');

let userToken;
let adminToken;
let userId;

beforeAll(async () => {
  const testUser = {
    name: 'franchise coverage user',
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

test('list franchises', async () => {
  const franchises = [
    { id: 1, name: 'pizzaPocket' },
    { id: 2, name: 'pizzaPalace' },
  ];

  jest.spyOn(DB, 'getFranchises').mockResolvedValue([franchises, false]);

  const res = await request(app).get('/api/franchise');

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ franchises, more: false });
});

test('user can get their own franchises', async () => {
  const franchises = [{ id: 1, name: 'pizzaPocket' }];
  const spy = jest.spyOn(DB, 'getUserFranchises').mockResolvedValue(franchises);

  const res = await request(app)
    .get(`/api/franchise/${userId}`)
    .set('Authorization', `Bearer ${userToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual(franchises);
  expect(spy).toHaveBeenCalledWith(userId);
});

test('user cannot get another users franchises', async () => {
  const spy = jest.spyOn(DB, 'getUserFranchises');

  const res = await request(app)
    .get('/api/franchise/999999')
    .set('Authorization', `Bearer ${userToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
  expect(spy).not.toHaveBeenCalled();
});

test('admin can get another users franchises', async () => {
  const franchises = [{ id: 2, name: 'admin lookup' }];
  const spy = jest.spyOn(DB, 'getUserFranchises').mockResolvedValue(franchises);

  const res = await request(app)
    .get('/api/franchise/999999')
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual(franchises);
  expect(spy).toHaveBeenCalledWith(999999);
});

test('admin can create a franchise', async () => {
  const franchise = { id: 1, name: 'new franchise' };
  const spy = jest.spyOn(DB, 'createFranchise').mockResolvedValue(franchise);

  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'new franchise' });

  expect(res.status).toBe(200);
  expect(res.body).toEqual(franchise);
  expect(spy).toHaveBeenCalledWith({ name: 'new franchise' });
});

test('diner cannot create a franchise', async () => {
  const spy = jest.spyOn(DB, 'createFranchise');

  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ name: 'unauthorized franchise' });

  expect(res.status).toBe(403);
  expect(spy).not.toHaveBeenCalled();
});

test('delete franchise', async () => {
  const spy = jest.spyOn(DB, 'deleteFranchise').mockResolvedValue();

  const res = await request(app).delete('/api/franchise/12');

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: 'franchise deleted' });
  expect(spy).toHaveBeenCalledWith(12);
});

test('franchise admin can create a store', async () => {
  const franchise = { id: 5, admins: [{ id: userId }] };
  const store = { id: 10, name: 'new store' };

  jest.spyOn(DB, 'getFranchise').mockResolvedValue(franchise);
  const spy = jest.spyOn(DB, 'createStore').mockResolvedValue(store);

  const res = await request(app)
    .post('/api/franchise/5/store')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ name: 'new store' });

  expect(res.status).toBe(200);
  expect(res.body).toEqual(store);
  expect(spy).toHaveBeenCalledWith(5, { name: 'new store' });
});

test('cannot create a store for a franchise the user does not manage', async () => {
  jest.spyOn(DB, 'getFranchise').mockResolvedValue({
    id: 5,
    admins: [{ id: 999999 }],
  });
  const spy = jest.spyOn(DB, 'createStore');

  const res = await request(app)
    .post('/api/franchise/5/store')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ name: 'unauthorized store' });

  expect(res.status).toBe(403);
  expect(spy).not.toHaveBeenCalled();
});

test('cannot create a store for a nonexistent franchise', async () => {
  jest.spyOn(DB, 'getFranchise').mockResolvedValue(null);
  const spy = jest.spyOn(DB, 'createStore');

  const res = await request(app)
    .post('/api/franchise/999999/store')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ name: 'orphan store' });

  expect(res.status).toBe(403);
  expect(spy).not.toHaveBeenCalled();
});

test('admin can delete a store', async () => {
  jest.spyOn(DB, 'getFranchise').mockResolvedValue({
    id: 5,
    admins: [],
  });
  const spy = jest.spyOn(DB, 'deleteStore').mockResolvedValue();

  const res = await request(app)
    .delete('/api/franchise/5/store/10')
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: 'store deleted' });
  expect(spy).toHaveBeenCalledWith(5, 10);
});

test('cannot delete a store for a franchise the user does not manage', async () => {
  jest.spyOn(DB, 'getFranchise').mockResolvedValue({
    id: 5,
    admins: [{ id: 999999 }],
  });
  const spy = jest.spyOn(DB, 'deleteStore');

  const res = await request(app)
    .delete('/api/franchise/5/store/10')
    .set('Authorization', `Bearer ${userToken}`);

  expect(res.status).toBe(403);
  expect(spy).not.toHaveBeenCalled();
});