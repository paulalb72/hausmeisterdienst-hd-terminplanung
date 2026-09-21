// Erzeugt einmalig die VAPID-Schlüssel für Web-Push: npm run genkeys
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log('\nIn server/.env eintragen:\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}\n`);
