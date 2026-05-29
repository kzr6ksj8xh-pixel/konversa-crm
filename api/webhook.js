const VERIFY_TOKEN = 'konversa_pingus_2024';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET = Webhook Verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified');
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send('Forbidden');
    }
  }

  // POST = Incoming messages
  if (req.method === 'POST') {
    const body = req.body;

    if (body.object === 'page') {
      body.entry.forEach(entry => {
        const event = entry.messaging ? entry.messaging[0] : null;
        if (event) {
          console.log('Message from:', event.sender.id);
          console.log('Content:', JSON.stringify(event.message));
        }
      });

      return res.status(200).send('EVENT_RECEIVED');
    }

    return res.status(404).send('Not Found');
  }

  return res.status(405).send('Method Not Allowed');
}
