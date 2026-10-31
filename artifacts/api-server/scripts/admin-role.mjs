// Run with the target environment's Clerk credentials. Never reuse development
// account IDs or keys in production.
import { clerkClient } from '@clerk/express';

const [action, emailArg] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
if (!['grant', 'revoke'].includes(action) || !email) {
  throw new Error('Usage: node scripts/admin-role.mjs grant|revoke admin@example.com');
}
const { data } = await clerkClient.users.getUserList({ emailAddress: [email], limit: 2 });
if (data.length !== 1) throw new Error('Akun harus dibuat dan email diverifikasi melalui halaman admin terlebih dahulu.');
const user = data[0];
const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
if (action === 'grant' && (primary?.emailAddress.toLowerCase() !== email ||
    primary.verification?.status !== 'verified')) {
  throw new Error('Email utama harus sesuai dan telah diverifikasi sebelum pemberian akses.');
}
await clerkClient.users.updateUserMetadata(user.id, {
  publicMetadata: { role: action === 'grant' ? 'admin' : null },
  privateMetadata: { adminBootstrapCompleted: true },
});
console.log(action === 'grant' ? 'Izin admin diberikan.' : 'Izin admin dicabut.');
