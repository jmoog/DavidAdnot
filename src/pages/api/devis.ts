import type { APIRoute } from 'astro';
import { spamScore, type DevisData } from '../../lib/antispam';

// Cette route s'exécute à la demande (pas de prérendu).
export const prerender = false;

// ────────────────────────────────────────────────────────────────────────
// Variables d'environnement (à configurer sur le serveur au déploiement) :
//   BREVO_API_KEY        → Clé API Brevo (xkeysib-...)
//   ADMIN_EMAILS         → emails admin séparés par virgule (notification)
//   FROM_EMAIL           → expéditeur vérifié dans Brevo (ex. contact@adnot-couvreur.fr)
//   FROM_NAME            → Adnot Couvreur - Couvreur 78 (optionnel)
//   TURNSTILE_SECRET_KEY → clé secrète Cloudflare Turnstile (anti-robot)
//   SPAM_RULES_URL       → JSON central des règles anti-spam (optionnel)
//
// Même architecture que robert-couvreur.fr : API HTTPS Brevo (le port 443
// passe partout, contrairement au SMTP sortant souvent bloqué chez les
// hébergeurs cloud), honeypot + time-trap + Turnstile + scoring de contenu.
// ────────────────────────────────────────────────────────────────────────

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const PRESTATION_LABELS: Record<string, string> = {
  'renovation-toiture':      'Rénovation / remplacement de toiture',
  'reparation-toiture':      'Réparation de toiture',
  'recherche-fuite':         'Recherche de fuite & infiltrations',
  'pose-bache-urgence':      'Pose de bâche en urgence',
  'nettoyage-demoussage':    'Nettoyage et démoussage de toiture',
  'application-traitement':  'Application de traitement (hydrofuge / anti-mousse)',
  'zinguerie':               'Zinguerie (noues, abergements, chéneaux)',
  'gouttieres':              'Pose ou remplacement de gouttières',
  'velux-fenetre-de-toit':   'Pose ou remplacement de Velux',
  'isolation-toiture':       'Isolation de toiture',
  'couverture-tuile':        'Couverture en tuile (plate ou mécanique)',
  'autre':                   'Autre / à préciser',
};

// Charte Adnot Couvreur — alignée sur src/styles/global.css (palette du logo)
const COLOR_BLUE   = '#1a5aa6'; // --bleu (bleu Adnot) : liens, CTA secondaire
const COLOR_BLUE_D = '#0e2f52'; // --bleu-fonce : en-têtes, pied de page
const COLOR_ORANGE = '#b73337'; // --rouge : CTA principal (« orange » historique)
const COLOR_LIGHT  = '#f8f8fc'; // --gris-50 : fonds discrets
const COLOR_TEXT   = '#15172e'; // --noir : texte courant
const COLOR_MUTED  = '#696d82'; // --gris-500 : texte secondaire
const COLOR_BORDER = '#e3e4ee'; // --gris-200 : filets / bordures

const SITE_URL   = 'https://www.adnot-couvreur.fr';
const TEL        = '06 60 49 14 30';
const TEL_HREF   = 'tel:+33660491430';
const ARTISAN    = 'David Adnot';
const ENTREPRISE = 'Adnot Couvreur - Couvreur dans les Yvelines (78)';
// PNG dédié aux emails : fond blanc intégré (pas de détourage) et format PNG,
// car Outlook n'affiche pas le webp et ignore padding/background CSS sur <img>.
const LOGO_URL   = `${SITE_URL}/images/logo-adnot-email.png`;

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function escapeHtml(s: unknown): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(s: unknown): string {
  return escapeHtml(s).replace(/\r?\n/g, '<br>');
}

// ────────────────────────────────────────────────────────────────────────
// Brevo API client (fetch direct sur l'API HTTPS, pas de SDK)
// ────────────────────────────────────────────────────────────────────────

interface BrevoSendArgs {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  to: Array<{ email: string; name?: string }>;
  replyTo?: { email: string; name?: string };
  subject: string;
  htmlContent: string;
}

async function brevoSend(args: BrevoSendArgs): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const body: Record<string, unknown> = {
    sender: { email: args.fromEmail, name: args.fromName },
    to: args.to,
    subject: args.subject,
    htmlContent: args.htmlContent,
  };
  if (args.replyTo) body.replyTo = args.replyTo;

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': args.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        if (err?.message) detail = String(err.message);
        else if (err?.code) detail = String(err.code);
      } catch {}
      return { ok: false, error: detail };
    }

    const json = await res.json().catch(() => ({} as any));
    return { ok: true, messageId: json?.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return { ok: false, error: msg };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Template — Notification admin
// ────────────────────────────────────────────────────────────────────────

function notifTemplate(d: DevisData) {
  const presta = PRESTATION_LABELS[d.prestation] || d.prestation || 'Non précisé';
  const telClean = (d.tel || '').replace(/[^0-9+]/g, '');
  const subject = `Nouvelle demande - ${presta} à ${d.ville}`;
  const prenom = (d.nom || '').split(' ')[0] || 'le client';

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${COLOR_LIGHT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLOR_TEXT};">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${COLOR_LIGHT};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
        <tr><td style="background:${COLOR_BLUE_D};padding:24px 32px;color:#fff;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td valign="middle" width="84" style="padding-right:18px;">
                <img src="${LOGO_URL}" width="72" height="72" alt="${ENTREPRISE}" style="display:block;width:72px;height:72px;border-radius:12px;">
              </td>
              <td valign="middle">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;opacity:.7;font-weight:700;">Nouvelle demande de devis</div>
                <div style="font-size:22px;font-weight:800;margin-top:6px;line-height:1.2;">${escapeHtml(presta)}</div>
                <div style="font-size:14px;opacity:.85;margin-top:4px;">à ${escapeHtml(d.ville)}</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${COLOR_MUTED};font-weight:700;margin-bottom:8px;">Client</div>
          <div style="font-size:18px;font-weight:700;color:${COLOR_BLUE_D};">${escapeHtml(d.nom)}</div>
        </td></tr>
        <tr><td style="padding:8px 32px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td width="50%" valign="top" style="padding:12px 12px 12px 0;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${COLOR_MUTED};font-weight:700;">Téléphone</div>
                <a href="tel:${escapeHtml(telClean)}" style="display:inline-block;margin-top:4px;color:${COLOR_BLUE};font-size:18px;font-weight:700;text-decoration:none;padding:6px 0;">${escapeHtml(d.tel)}</a>
              </td>
              <td width="50%" valign="top" style="padding:12px 0 12px 12px;border-left:1px solid ${COLOR_BORDER};">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${COLOR_MUTED};font-weight:700;">Email</div>
                <a href="mailto:${escapeHtml(d.email)}" style="display:inline-block;margin-top:4px;color:${COLOR_BLUE};font-size:14px;font-weight:600;text-decoration:none;word-break:break-all;">${escapeHtml(d.email)}</a>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding:8px 0;">
                <a href="tel:${escapeHtml(telClean)}" style="display:block;background:${COLOR_ORANGE};color:#fff;text-decoration:none;padding:20px 24px;border-radius:10px;font-weight:700;font-size:17px;line-height:1.3;text-align:center;">Appeler ${escapeHtml(prenom)} — ${escapeHtml(d.tel)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;">
                <a href="mailto:${escapeHtml(d.email)}?subject=${encodeURIComponent('Re: votre demande de devis - Adnot Couvreur')}" style="display:block;background:${COLOR_BLUE};color:#fff;text-decoration:none;padding:20px 24px;border-radius:10px;font-weight:700;font-size:17px;line-height:1.3;text-align:center;">Répondre par email</a>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <div style="background:${COLOR_LIGHT};border-radius:8px;padding:18px 20px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${COLOR_MUTED};font-weight:700;margin-bottom:10px;">Description du chantier</div>
            <div style="font-size:14px;line-height:1.65;color:${COLOR_TEXT};">
              ${d.message ? nl2br(d.message) : '<em style="color:' + COLOR_MUTED + ';">Aucune description fournie.</em>'}
            </div>
          </div>
        </td></tr>
        <tr><td style="background:${COLOR_LIGHT};padding:16px 32px;border-top:1px solid ${COLOR_BORDER};font-size:12px;color:${COLOR_MUTED};text-align:center;">
          Demande reçue le ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })}<br>
          via <a href="${SITE_URL}/contact/" style="color:${COLOR_BLUE};text-decoration:none;">www.adnot-couvreur.fr/contact/</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}

// ────────────────────────────────────────────────────────────────────────
// Template — Accusé de réception client
// ────────────────────────────────────────────────────────────────────────

function ackTemplate(d: DevisData) {
  const presta = PRESTATION_LABELS[d.prestation] || d.prestation || 'votre demande';
  const subject = `Nous avons bien reçu votre demande - Adnot Couvreur`
  const prenom = (d.nom || '').split(' ')[0];

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${COLOR_LIGHT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLOR_TEXT};">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${COLOR_LIGHT};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
        <tr><td style="background:${COLOR_BLUE_D};padding:32px 32px 28px;color:#fff;text-align:center;">
          <img src="${LOGO_URL}" width="120" height="120" alt="${ENTREPRISE}" style="display:block;width:120px;height:120px;margin:0 auto 16px;border-radius:16px;">
          <div style="font-size:20px;font-weight:800;">Adnot Couvreur</div>
          <div style="font-size:13px;opacity:.85;margin-top:2px;">Artisan couvreur dans les Yvelines (78)</div>
        </td></tr>
        <tr><td style="padding:32px 32px 12px;">
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:${COLOR_BLUE_D};line-height:1.3;">Bonjour ${escapeHtml(prenom)},</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${COLOR_TEXT};">
            Nous avons bien reçu votre demande de devis pour <strong>${escapeHtml(presta.toLowerCase())}</strong> à <strong>${escapeHtml(d.ville)}</strong>. Merci de votre confiance.
          </p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${COLOR_TEXT};">
            Nous vous recontactons sous <strong>24 à 48 heures ouvrées</strong> pour convenir d'une visite. Nous inspectons votre toiture sur place, puis nous vous remettons un devis détaillé poste par poste, gratuit et sans engagement.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${COLOR_TEXT};">
            En cas d'urgence (fuite active, sinistre, bâchage), n'attendez pas notre rappel — appelez directement.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 24px;" align="center">
          <a href="${TEL_HREF}" style="display:block;background:${COLOR_ORANGE};color:#fff;text-decoration:none;padding:18px 28px;border-radius:10px;font-weight:700;font-size:17px;text-align:center;line-height:1.3;">Appeler le ${TEL}</a>
        </td></tr>
        <tr><td style="padding:0 32px 28px;">
          <div style="background:${COLOR_LIGHT};border-radius:8px;padding:18px 20px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${COLOR_MUTED};font-weight:700;margin-bottom:12px;">Récapitulatif de votre demande</div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size:14px;">
              <tr><td style="padding:4px 0;color:${COLOR_MUTED};width:120px;">Prestation</td>
                  <td style="padding:4px 0;color:${COLOR_TEXT};font-weight:600;">${escapeHtml(presta)}</td></tr>
              <tr><td style="padding:4px 0;color:${COLOR_MUTED};">Commune</td>
                  <td style="padding:4px 0;color:${COLOR_TEXT};font-weight:600;">${escapeHtml(d.ville)}</td></tr>
              <tr><td style="padding:4px 0;color:${COLOR_MUTED};">Téléphone</td>
                  <td style="padding:4px 0;color:${COLOR_TEXT};font-weight:600;">${escapeHtml(d.tel)}</td></tr>
            </table>
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 28px;">
          <p style="margin:0;font-size:15px;line-height:1.5;color:${COLOR_TEXT};">
            À très vite,<br>
            <strong style="color:${COLOR_BLUE_D};">${ARTISAN}</strong><br>
            <span style="color:${COLOR_MUTED};font-size:13px;">Artisan couvreur - ${ENTREPRISE}</span>
          </p>
        </td></tr>
        <tr><td style="background:${COLOR_BLUE_D};padding:20px 32px;color:#fff;text-align:center;font-size:12px;line-height:1.6;">
          <strong style="font-size:14px;">${ENTREPRISE}</strong><br>
          Rambouillet, 78120<br>
          <a href="${SITE_URL}" style="color:#fff;text-decoration:underline;opacity:.85;">www.adnot-couvreur.fr</a> &nbsp;·&nbsp; <a href="${TEL_HREF}" style="color:#fff;text-decoration:underline;opacity:.85;">${TEL}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}

// ────────────────────────────────────────────────────────────────────────
// Handler POST /api/devis
// ────────────────────────────────────────────────────────────────────────

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error('[devis] BREVO_API_KEY missing');
    return jsonResponse(500, { ok: false, error: 'Configuration serveur incomplète.' });
  }

  // Parse JSON
  let raw: any;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse(400, { ok: false, error: 'Invalid JSON' });
  }

  // Anti-spam #1 : champ honeypot vide attendu
  if (raw?.website && String(raw.website).trim() !== '') {
    console.warn('[devis] spam bloqué (honeypot)');
    return jsonResponse(200, { ok: true });
  }

  // Anti-spam #2 : time-trap — soumission < 3 s après chargement = bot
  if (raw?.ts) {
    const elapsed = Date.now() - Number(raw.ts);
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 3000) {
      console.warn(`[devis] spam bloqué (time-trap, ${elapsed}ms)`);
      return jsonResponse(200, { ok: true });
    }
  }

  // Anti-robot : Cloudflare Turnstile (vérifié uniquement si la clé secrète est configurée)
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const token = typeof raw?.['cf-turnstile-response'] === 'string' ? raw['cf-turnstile-response'].trim() : '';
    if (!token) {
      return jsonResponse(400, { ok: false, error: 'Merci de valider le test anti-robot.' });
    }
    try {
      const ip = request.headers.get('cf-connecting-ip')
        || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || '';
      const params = new URLSearchParams({ secret: turnstileSecret, response: token });
      if (ip) params.set('remoteip', ip);
      const tRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const tOut: any = await tRes.json().catch(() => ({}));
      if (!tOut?.success) {
        return jsonResponse(400, { ok: false, error: 'Vérification anti-robot échouée, merci de réessayer.' });
      }
    } catch {
      return jsonResponse(502, { ok: false, error: `Vérification anti-robot indisponible, merci de nous appeler au ${TEL}.` });
    }
  }

  // Validation des champs obligatoires
  const required = ['nom', 'tel', 'email', 'ville', 'prestation'] as const;
  for (const f of required) {
    if (!raw?.[f] || String(raw[f]).trim() === '') {
      return jsonResponse(400, { ok: false, error: `Champ manquant : ${f}` });
    }
  }

  // Sanitize
  const data: DevisData = {
    nom:        String(raw.nom).trim().slice(0, 100),
    tel:        String(raw.tel).trim().slice(0, 30),
    email:      String(raw.email).trim().slice(0, 200),
    ville:      String(raw.ville).trim().slice(0, 100),
    prestation: String(raw.prestation).trim().slice(0, 80),
    message:    String(raw.message || '').trim().slice(0, 4000),
  };

  // Anti-spam #3 : scoring de contenu (bloque les démarchages SEO/avis Google
  // et les demandes exotiques de l'étranger — liste centrale partagée)
  const verdict = await spamScore(data);
  if (verdict.score >= verdict.threshold) {
    console.warn(
      `[devis] spam bloqué (score ${verdict.score}/${verdict.threshold}, règles ${verdict.version}) — ` +
      `${verdict.reasons.join(', ')} — tel="${data.tel}" email="${data.email}"`
    );
    return jsonResponse(200, { ok: true });
  }

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminEmails.length === 0) {
    console.error('[devis] ADMIN_EMAILS missing');
    return jsonResponse(500, { ok: false, error: 'Configuration serveur incomplète.' });
  }

  const fromEmail = process.env.FROM_EMAIL || 'contact@adnot-couvreur.fr';
  const fromName  = process.env.FROM_NAME  || ENTREPRISE;

  // 1) Notification admin
  const notif = notifTemplate(data);
  const r1 = await brevoSend({
    apiKey,
    fromEmail,
    fromName,
    to: adminEmails.map((email) => ({ email })),
    replyTo: { email: data.email, name: data.nom },
    subject: notif.subject,
    htmlContent: notif.html,
  });

  if (!r1.ok) {
    console.error('[devis] Erreur envoi notif admin (Brevo):', r1.error);
    return jsonResponse(502, {
      ok: false,
      error: `Envoi impossible pour le moment, merci de nous appeler au ${TEL}.`,
    });
  }

  // 2) Accusé client (best effort - ne bloque pas si échec)
  const ack = ackTemplate(data);
  const r2 = await brevoSend({
    apiKey,
    fromEmail,
    fromName: `${ARTISAN} - Adnot Couvreur`,
    to: [{ email: data.email, name: data.nom }],
    replyTo: { email: fromEmail, name: fromName },
    subject: ack.subject,
    htmlContent: ack.html,
  });
  if (!r2.ok) {
    console.error('[devis] Echec accusé client (non bloquant):', r2.error);
  }

  return jsonResponse(200, { ok: true });
};

// Bloque les autres méthodes proprement.
export const GET: APIRoute = () =>
  new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
