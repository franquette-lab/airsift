const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function validateAndNormalizeUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string') {
    throw new Error('URL invalide.');
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Veuillez saisir une URL.');
  }

  // Bloque explicitement tout schéma dangereux avant même d'ajouter https://
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error('Protocole non autorisé. Seuls http:// et https:// sont acceptés.');
  }

  // Ajoute https:// par défaut si l'utilisateur a saisi uniquement "wikipedia.org"
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Format d'URL invalide.");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Protocole interdit : ${parsed.protocol}`);
  }

  if (!parsed.hostname || !parsed.hostname.includes('.')) {
    // Autorise localhost uniquement si nécessaire, sinon exige un domaine valide
    if (parsed.hostname !== 'localhost') {
      throw new Error("Nom de domaine d'URL invalide.");
    }
  }

  return parsed.toString();
}
