import { ImapFlow } from 'imapflow';

async function main() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: 'sandaluci88@gmail.com',
      pass: 'dlvmaneczqaipqka'
    },
    logger: false as any
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  try {
    const unseen = await client.search({ seen: false });
    console.log('OKUNMAMIS MESAJ:', unseen.length);
    console.log('UIDs:', JSON.stringify(unseen));

    if (unseen.length > 0) {
      for (const uid of unseen.slice(0, 5)) {
        const msg = await client.fetchOne(uid, { envelope: true });
        console.log('  UID', uid, ':', msg.envelope.subject, 'from:', msg.envelope.from?.[0]?.address);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
