const request = require('supertest');
const app = require('../service');
const { DB } = require('../database/database.js');
const jwt = require('jsonwebtoken');
const config = require('../config.js');

let userToken;
let adminToken;

const originalFetch = global.fetch;

beforeAll(async () => {
  const testUser = {
    name: 'order coverage user',
    email: `${Math.random().toString(36).substring(2, 12)}@test.com`,
    password: 'test',
  };

  const userRes = await request(app).post('/api/auth').send(testUser);
  userToken = userRes.body.token;

  const admin = await DB.getUser('a@jwt.com');
  adminToken = jwt.sign(admin, config.jwtSecret);
  await DB.loginUser(admin.id, adminToken);
});

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = originalFetch;
});

test('get menu', async () => {
  const menu = [{ id: 1, title: 'Veggie', price: 10 }];
  jest.spyOn(DB, 'getMenu').mockResolvedValue(menu);

  const res = await request(app).get('/api/order/menu');

  expect(res.status).toBe(200);
  expect(res.body).toEqual(menu);
});

test('admin can add a menu item', async () => {
  const menu = [{ id: 1, title: 'Pepperoni' }];
  const addSpy = jest.spyOn(DB, 'addMenuItem').mockResolvedValue();
  jest.spyOn(DB, 'getMenu').mockResolvedValue(menu);

  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Pepperoni', price: 12 });

  expect(res.status).toBe(200);
  expect(res.body).toEqual(menu);
  expect(addSpy).toHaveBeenCalled();
});

test('diner cannot add a menu item', async () => {
  const addSpy = jest.spyOn(DB, 'addMenuItem');

  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ title: 'Unauthorized pizza' });

  expect(res.status).toBe(403);
  expect(addSpy).not.toHaveBeenCalled();
});

test('get orders for the authenticated user', async () => {
  const orders = { orders: [{ id: 1 }], more: false };
  const spy = jest.spyOn(DB, 'getOrders').mockResolvedValue(orders);

  const res = await request(app)
    .get('/api/order')
    .set('Authorization', `Bearer ${userToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual(orders);
  expect(spy).toHaveBeenCalled();
});

test('create order when factory succeeds', async () => {
  const order = { id: 1, franchiseId: 1 };
  jest.spyOn(DB, 'addDinerOrder').mockResolvedValue(order);

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      reportUrl: 'http://factory.test/report',
      jwt: 'factory-jwt',
    }),
  });

  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ franchiseId: 1 });

  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    order,
    followLinkToEndChaos: 'http://factory.test/report',
    jwt: 'factory-jwt',
  });
  expect(global.fetch).toHaveBeenCalled();
});

test('create order when factory fails', async () => {
  const order = { id: 2, franchiseId: 1 };
  jest.spyOn(DB, 'addDinerOrder').mockResolvedValue(order);

  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({
      reportUrl: 'http://factory.test/report',
    }),
  });

  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ franchiseId: 1 });

  expect(res.status).toBe(500);
  expect(res.body).toEqual({
    message: 'Failed to fulfill order at factory',
    followLinkToEndChaos: 'http://factory.test/report',
  });
});