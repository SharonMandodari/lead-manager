import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db.js';

let db;
let api;
before(async () => {
  db = createDatabase(':memory:');
  api = request.agent(createApp({ db }));
  await api.post('/api/auth/register').send({ name: 'Asha Rao', email: 'asha@example.com', password: 'LeadPass123' }).expect(201);
});
after(() => db.close());
const lead = { name: 'Asha Rao', email: 'asha@example.com', phone: '+91 98765 43210', company: 'Acme', source: 'Referral', status: 'New' };

test('creates, searches, filters, updates and deletes a lead', async () => {
  const created = await api.post('/api/leads').send(lead).expect(201);
  const id = created.body.lead.id;
  assert.equal(created.body.lead.name, lead.name);
  assert.deepEqual((await api.get('/api/stats').expect(200)).body, { total: 1, counts: { New: 1, Contacted: 0, Qualified: 0, Lost: 0 } });
  assert.equal((await api.get('/api/leads?q=asha').expect(200)).body.leads.length, 1);
  await api.get('/api/leads?status=New').expect(200);
  const updated = await api.put(`/api/leads/${id}`).send({ ...lead, status: 'Qualified' }).expect(200);
  assert.equal(updated.body.lead.status, 'Qualified');
  await api.delete(`/api/leads/${id}`).expect(204);
  await api.get(`/api/leads/${id}`).expect(404);
});

test('rejects invalid data and filters', async () => {
  const invalid = await api.post('/api/leads').send({ ...lead, email: 'bad' }).expect(400);
  assert.ok(invalid.body.errors.email);
  await api.get('/api/leads?status=Unknown').expect(400);
});

test('requires authentication and keeps leads private between accounts', async () => {
  const anonymous = request(createApp({ db }));
  await anonymous.get('/api/leads').expect(401);
  const other = request.agent(createApp({ db }));
  await other.post('/api/auth/register').send({ name: 'Sam Lee', email: 'sam@example.com', password: 'AnotherPass123' }).expect(201);
  const own = await other.get('/api/leads').expect(200);
  assert.equal(own.body.leads.length, 0);
  await other.get('/api/stats').expect(200).expect(({ body }) => assert.equal(body.total, 0));
  const session = await other.post('/api/auth/logout').expect(204);
  assert.ok(session.headers['set-cookie'][0].includes('Max-Age=0'));
  await other.get('/api/leads').expect(401);
});

test('rejects duplicate registrations and incorrect passwords', async () => {
  await request(createApp({ db })).post('/api/auth/register').send({ name: 'Another Asha', email: 'ASHA@example.com', password: 'LeadPass123' }).expect(409);
  await request(createApp({ db })).post('/api/auth/login').send({ email: 'asha@example.com', password: 'incorrect-password' }).expect(401);
});
