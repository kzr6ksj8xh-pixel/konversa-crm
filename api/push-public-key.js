// Sirve la clave pública VAPID al frontend para suscribirse a Web Push.
// La clave pública NO es secreta; vive en Vercel como VAPID_PUBLIC_KEY.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
}
