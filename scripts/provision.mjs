// Sano-Técnico — Crea las cuentas de las sedes y el administrador general.
// Uso:  node provision.mjs [cantidad=20] [--emu]
// Genera contraseñas y PIN aleatorios y los guarda en ../CREDENCIALES_SANO_TECNICO.txt
// Es seguro re-ejecutarlo: conserva las cuentas y contraseñas ya creadas.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { webcrypto, randomInt } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const EMU = process.argv.includes('--emu');
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 20);
const OUT = path.join(here, '..', EMU ? 'CREDENCIALES_EMULADOR.txt' : 'CREDENCIALES_SANO_TECNICO.txt');
const STATE = path.join(here, EMU ? '.accounts-emu.json' : '.accounts.json');
const DOMAIN = 'sanotecnico.app';
const APP_URL = 'https://sano-tecnico.web.app';

const config = {
  apiKey: 'AIzaSyCIKVGJMnU3Xk0TTIaxPhFR7VyfIIoZQXI',
  authDomain: 'sano-tecnico.firebaseapp.com',
  projectId: 'sano-tecnico',
  storageBucket: 'sano-tecnico.firebasestorage.app',
  messagingSenderId: '84045512186',
  appId: '1:84045512186:web:c1bcbbf3af2424de7d7843'
};

const SERVICES = [
  { name: 'Revisión / diagnóstico', price: 5 },
  { name: 'Cambio de pantalla (mano de obra)', price: 15 },
  { name: 'Cambio de batería (mano de obra)', price: 8 },
  { name: 'Cambio de pin de carga', price: 10 },
  { name: 'Limpieza por humedad', price: 15 },
  { name: 'Actualización / flasheo de software', price: 12 },
  { name: 'Respaldo de información', price: 6 },
  { name: 'Reparación de placa', price: 25 },
  { name: 'Cambio de tapa trasera', price: 8 },
  { name: 'Mantenimiento laptop / PC', price: 15 }
];
const SETTINGS = {
  rif: '', phone: '', whatsapp: '', address: '', instagram: '', receiptFooter: '¡Gracias por confiar en nosotros!', receiptFormat: '80mm', orderFormat: 'carta', docTitle: 'NOTA DE ENTREGA',
  rate: 0, rateUpdatedAt: null, rateAuto: true, iva: 0, warrantyDays: 30,
  terms: 'El cliente autoriza la revisión del equipo. La revisión tiene un costo si no se aprueba la reparación. Los equipos con humedad o golpes pueden presentar fallas adicionales. La garantía cubre solo la pieza y el trabajo realizado; no cubre golpes, humedad ni manipulación de terceros. Equipos no retirados en 90 días se consideran abandonados. Respalde su información: el taller no se hace responsable por pérdida de datos.',
  services: SERVICES,
  categories: ['Pantallas', 'Baterías', 'Pines de carga', 'Flex', 'Cámaras', 'Tapas', 'Cornetas y micrófonos', 'Placas y chips', 'Forros', 'Vidrios templados', 'Cargadores', 'Cables', 'Audífonos', 'Memorias', 'Otros'],
  techs: []
};
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const genPass = () => 'St-' + Array.from({ length: 9 }, () => ALPHA[randomInt(ALPHA.length)]).join('') + '!' + randomInt(10, 99);
const genPin = () => String(randomInt(1000, 9999));
const sha256 = async (t) => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('hex');

const saved = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const app = initializeApp(config, 'provision');
const auth = getAuth(app);
const db = initializeFirestore(app, {});
if (EMU) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8180);
}
async function ensureUser(email, password) {
  try { return (await createUserWithEmailAndPassword(auth, email, password)).user; }
  catch (e) { if (e.code === 'auth/email-already-in-use') return (await signInWithEmailAndPassword(auth, email, password)).user; throw e; }
}

// 1) Administrador general (crea los documentos de las sedes)
const admin = saved.admin || { code: 'admin', email: `admin@${DOMAIN}`, password: genPass() };
const au = await ensureUser(admin.email, admin.password);
admin.uid = au.uid; saved.admin = admin;
await signOut(auth);
console.log(`✔ administrador general (${au.uid})`);

// 2) Cuentas de las sedes
const accounts = [];
for (let i = 1; i <= COUNT; i++) {
  const code = 'sede' + String(i).padStart(2, '0');
  const email = `${code}@${DOMAIN}`;
  const acc = saved[code] || { code, email, password: genPass(), pin: genPin(), name: `Sede ${String(i).padStart(2, '0')}` };
  const user = await ensureUser(email, acc.password);
  acc.uid = user.uid;
  await signOut(auth);
  saved[code] = acc; accounts.push(acc);
}
writeFileSync(STATE, JSON.stringify(saved, null, 2));

// 3) Documentos de las sedes (como administrador)
await signInWithEmailAndPassword(auth, admin.email, admin.password);
for (const acc of accounts) {
  const tRef = doc(db, 'tenants', acc.uid);
  if ((await getDoc(tRef)).exists()) { console.log(`• ${acc.code} ya existía`); continue; }
  const now = new Date().toISOString();
  await setDoc(tRef, { name: acc.name, code: acc.code, ownerUid: acc.uid, ownerEmail: acc.email, active: true, createdAt: now, createdBy: 'provision', plan: 'Básico', paidUntil: null, ownerName: '', ownerPhone: '', notes: '' });
  await setDoc(doc(db, 'tenants', acc.uid, 'config', 'settings'), { ...SETTINGS, businessName: acc.name });
  await setDoc(doc(db, 'tenants', acc.uid, 'config', 'security'), { pinHash: await sha256(`${acc.uid}:${acc.pin}`), updatedAt: now });
  await setDoc(doc(db, 'usernames', acc.code), { email: acc.email, uid: acc.uid, createdAt: now });
  console.log(`✔ ${acc.code} creada (${acc.uid})`);
}
await setDoc(doc(db, 'usernames', 'admin'), { email: admin.email, uid: admin.uid, createdAt: new Date().toISOString() });
await signOut(auth);

const lines = [
  'SANO-TÉCNICO — CREDENCIALES DE ACCESO' + (EMU ? ' (EMULADOR DE PRUEBAS)' : ''),
  `Generado: ${new Date().toLocaleString('es-VE')}`,
  `Aplicación: ${APP_URL}`,
  '',
  'Inicia sesión escribiendo el USUARIO (ej. sede01) o el correo completo.',
  'El PIN protege reportes, anulaciones, cancelaciones de órdenes, mermas, gastos, cierre de caja y la clave de los equipos.',
  'Cada sede puede cambiar su contraseña y su PIN en Configuración > Seguridad.',
  'GUARDA ESTE ARCHIVO EN UN LUGAR SEGURO. NO LO COMPARTAS.',
  '',
  'ADMINISTRADOR GENERAL (panel de todas las sedes)',
  `  Usuario: admin    Correo: ${admin.email}    Contraseña: ${admin.password}`,
  '',
  'SEDES',
  '  Usuario   Contraseña          PIN    Correo',
  ...accounts.map((a) => `  ${a.code.padEnd(9)} ${a.password.padEnd(19)} ${a.pin}   ${a.email}`),
  '',
  'Demo: botón "Probar demo gratis" en la pantalla de inicio (30 min, sin registro, PIN 1234).',
  `Consulta del cliente: ${APP_URL}/estado/CODIGO (el código va impreso en cada orden con su QR).`,
  'Ventas / soporte por WhatsApp: +58 422-190 6045'
];
writeFileSync(OUT, lines.join('\r\n'), 'utf8');
console.log(`\nCredenciales guardadas en ${OUT}`);
await deleteApp(app);
process.exit(0);
