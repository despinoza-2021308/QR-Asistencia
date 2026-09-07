/**
 * Utilidad CLI para generar hashes de contraseñas seguros usando scrypt
 * Uso: node hash-password.js <tu_password_aqui>
 */
const crypto = require('crypto');

const password = process.argv[2];

if (!password) {
    console.log('Uso: node hash-password.js <tu_password>');
    console.log('Ejemplo: node hash-password.js MiPasswordSegura2026!');
    process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const derivedKey = crypto.scryptSync(password, salt, 64);
const hash = `scrypt$${salt}$${derivedKey.toString('hex')}`;

console.log('\n======================================================');
console.log('✅ HASH GENERADO CON ÉXITO:');
console.log(hash);
console.log('======================================================');
console.log('Copia esta línea y agrégala en tu archivo .env o en Vercel:');
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
