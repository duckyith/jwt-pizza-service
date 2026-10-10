jest.mock('mysql2/promise', () => ({
  createConnection: jest.fn().mockResolvedValue({
    execute: jest.fn().mockResolvedValue([
      [{ SCHEMA_NAME: 'pizza' }],
      [],
    ]),
    query: jest.fn().mockResolvedValue([[], []]),
    end: jest.fn().mockResolvedValue(),
  }),
}));

const { DB } = require('../database/database.js');
const bcrypt = require('bcrypt');

let connection;

beforeEach(() => {
  connection = {
    execute: jest.fn().mockResolvedValue([[], []]),
    end: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
  };

  jest.spyOn(DB, 'getConnection').mockResolvedValue(connection);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('getMenu returns menu rows', async () => {
  const menu = [{ id: 1, title: 'Veggie' }];
  jest.spyOn(DB, 'query').mockResolvedValue(menu);

  await expect(DB.getMenu()).resolves.toEqual(menu);
  expect(connection.end).toHaveBeenCalled();
});

test('addMenuItem inserts an item and returns its ID', async () => {
  jest.spyOn(DB, 'query').mockResolvedValue({ insertId: 7 });

  const item = { title: 'Veggie', price: 10 };
  const result = await DB.addMenuItem(item);

  expect(result).toEqual({ ...item, id: 7 });
  expect(connection.end).toHaveBeenCalled();
});

test('getUser throws when the email is unknown', async () => {
  jest.spyOn(DB, 'query').mockResolvedValue([]);

  await expect(DB.getUser('missing@test.com')).rejects.toThrow('unknown user');
  expect(connection.end).toHaveBeenCalled();
});

test('getUser returns the user and roles', async () => {
  jest.spyOn(DB, 'query')
    .mockResolvedValueOnce([{ id: 3, name: 'Test', email: 'test@test.com', password: 'hash' }])
    .mockResolvedValueOnce([
      { role: 'diner', objectId: 0 },
      { role: 'franchisee', objectId: 8 },
    ]);

  const user = await DB.getUser('test@test.com');

  expect(user.roles).toEqual([
    { role: 'diner', objectId: undefined },
    { role: 'franchisee', objectId: 8 },
  ]);
  expect(user.password).toBeUndefined();
});

test('getUser throws when the password is incorrect', async () => {
  jest.spyOn(DB, 'query').mockResolvedValue([
    { id: 3, password: 'hash' },
  ]);
  jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

  await expect(DB.getUser('test@test.com', 'wrong')).rejects.toThrow('unknown user');
});

test('updateUser updates supplied fields', async () => {
  const querySpy = jest.spyOn(DB, 'query').mockResolvedValue({});
  jest.spyOn(DB, 'getUser').mockResolvedValue({ id: 3, name: 'Updated' });

  const result = await DB.updateUser(3, 'Updated', undefined, undefined);

  expect(querySpy).toHaveBeenCalledWith(
    connection,
    expect.stringContaining("name='Updated'"),
  );
  expect(result).toEqual({ id: 3, name: 'Updated' });
});

test('updateUser skips the update query when no fields are supplied', async () => {
  const querySpy = jest.spyOn(DB, 'query');
  jest.spyOn(DB, 'getUser').mockResolvedValue({ id: 3 });

  await DB.updateUser(3, undefined, undefined, undefined);

  expect(querySpy).not.toHaveBeenCalled();
});

test('loginUser stores the token signature', async () => {
  const spy = jest.spyOn(DB, 'query').mockResolvedValue([]);

  await DB.loginUser(4, 'header.payload.signature');

  expect(spy).toHaveBeenCalledWith(
    connection,
    expect.stringContaining('INSERT INTO auth'),
    ['signature', 4],
  );
});

test('isLoggedIn returns true when a token exists', async () => {
  jest.spyOn(DB, 'query').mockResolvedValue([{ userId: 4 }]);

  await expect(DB.isLoggedIn('header.payload.signature')).resolves.toBe(true);
});

test('isLoggedIn returns false when a token does not exist', async () => {
  jest.spyOn(DB, 'query').mockResolvedValue([]);

  await expect(DB.isLoggedIn('header.payload.signature')).resolves.toBe(false);
});

test('logoutUser deletes the token', async () => {
  const spy = jest.spyOn(DB, 'query').mockResolvedValue([]);

  await DB.logoutUser('header.payload.signature');

  expect(spy).toHaveBeenCalledWith(
    connection,
    'DELETE FROM auth WHERE token=?',
    ['signature'],
  );
});

test('getOffset calculates the page offset', () => {
  expect(DB.getOffset(1, 10)).toBe(0);
  expect(DB.getOffset(3, 10)).toBe(20);
});

test('getTokenSignature extracts the JWT signature', () => {
  expect(DB.getTokenSignature('header.payload.signature')).toBe('signature');
  expect(DB.getTokenSignature('invalid')).toBe('');
});

test('createStore returns the inserted store', async () => {
  jest.spyOn(DB, 'query').mockResolvedValue({ insertId: 12 });

  await expect(DB.createStore(5, { name: 'Provo' })).resolves.toEqual({
    id: 12,
    franchiseId: 5,
    name: 'Provo',
  });
});

test('deleteStore deletes the specified store', async () => {
  const spy = jest.spyOn(DB, 'query').mockResolvedValue([]);

  await DB.deleteStore(5, 12);

  expect(spy).toHaveBeenCalledWith(
    connection,
    'DELETE FROM store WHERE franchiseId=? AND id=?',
    [5, 12],
  );
});

test('getID returns an existing ID', async () => {
  const fakeConnection = {
    execute: jest.fn().mockResolvedValue([[{ id: 9 }]]),
  };

  await expect(DB.getID(fakeConnection, 'name', 'Provo', 'franchise')).resolves.toBe(9);
});

test('getID throws when no ID is found', async () => {
  const fakeConnection = {
    execute: jest.fn().mockResolvedValue([[]]),
  };

  await expect(DB.getID(fakeConnection, 'name', 'Missing', 'franchise')).rejects.toThrow('No ID found');
});


test('getOrders returns orders with their items', async () => {
  jest.spyOn(DB, 'query')
    .mockResolvedValueOnce([
      { id: 1, franchiseId: 2, storeId: 3, date: 'today' },
    ])
    .mockResolvedValueOnce([{ id: 4, description: 'Cheese pizza' }]);

  const result = await DB.getOrders({ id: 7 });

  expect(result.dinerId).toBe(7);
  expect(result.orders[0].items).toEqual([
    { id: 4, description: 'Cheese pizza' },
  ]);
});

test('addDinerOrder inserts the order and its items', async () => {
  jest.spyOn(DB, 'query')
    .mockResolvedValueOnce({ insertId: 11 });

  jest.spyOn(DB, 'getID').mockResolvedValue(3);

  const order = {
    franchiseId: 2,
    storeId: 4,
    items: [{ menuId: 3, description: 'Cheese pizza', price: 12 }],
  };

  const result = await DB.addDinerOrder({ id: 7 }, order);

  expect(result).toEqual({ ...order, id: 11 });
  expect(DB.getID).toHaveBeenCalledWith(connection, 'id', 3, 'menu');
});

test('createFranchise creates a franchise and assigns its admin', async () => {
  jest.spyOn(DB, 'query')
    .mockResolvedValueOnce([{ id: 4, name: 'Test Admin' }])
    .mockResolvedValueOnce({ insertId: 9 })
    .mockResolvedValueOnce([]);

  const franchise = {
    name: 'Test Franchise',
    admins: [{ email: 'admin@test.com' }],
  };

  const result = await DB.createFranchise(franchise);

  expect(result.id).toBe(9);
  expect(result.admins[0]).toMatchObject({
    id: 4,
    name: 'Test Admin',
  });
});

test('createFranchise rejects an unknown admin', async () => {
  jest.spyOn(DB, 'query').mockResolvedValueOnce([]);

  await expect(
    DB.createFranchise({
      name: 'Test Franchise',
      admins: [{ email: 'missing@test.com' }],
    }),
  ).rejects.toThrow('unknown user for franchise admin');
});

test('deleteFranchise rolls back if a delete query fails', async () => {
  jest.spyOn(DB, 'query').mockRejectedValueOnce(new Error('delete failed'));

  await expect(DB.deleteFranchise(9)).rejects.toThrow(
    'unable to delete franchise',
  );

  expect(connection.beginTransaction).toHaveBeenCalled();
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
});

test('getUserFranchises returns an empty list when user has no franchises', async () => {
  jest.spyOn(DB, 'query').mockResolvedValueOnce([]);

  await expect(DB.getUserFranchises(7)).resolves.toEqual([]);
});

test('getFranchise adds admins and stores', async () => {
  jest.spyOn(DB, 'query')
    .mockResolvedValueOnce([{ id: 7, name: 'Admin' }])
    .mockResolvedValueOnce([{ id: 3, name: 'Provo', totalRevenue: 25 }]);

  const franchise = { id: 9, name: 'Test Franchise' };
  const result = await DB.getFranchise(franchise);

  expect(result.admins).toEqual([{ id: 7, name: 'Admin' }]);
  expect(result.stores).toEqual([
    { id: 3, name: 'Provo', totalRevenue: 25 },
  ]);
});