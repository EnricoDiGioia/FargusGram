// =====================================================================
//  Configuração do FargusGram
//
//  Cole aqui os dados do seu projeto Supabase.
//  No painel do Supabase: Project Settings → API Keys (a chave) e
//  Project Settings → Data API (a URL). Veja o README.md.
//
//  Estes dois valores são públicos por natureza (vão para o navegador
//  de todo mundo). Quem protege os dados são as regras do setup.sql.
// =====================================================================

const env = import.meta.env ?? {};

export const SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://SEU-PROJETO.supabase.co';

export const SUPABASE_KEY = env.VITE_SUPABASE_KEY || 'COLE-AQUI-A-CHAVE-PUBLICA';

// Nome que aparece no app
export const APP_NAME = 'FargusGram';
