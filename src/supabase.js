
// src/supabase.js

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Recuperar as credenciais do arquivo .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

// Verificar se as credenciais foram configuradas
if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
        'SUPABASE_URL ou SUPABASE_SECRET_KEY não configuradas no arquivo .env'
    );
}

// Criar conexão com o Supabase
export const supabase = createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
        }
    }
);

console.log('Cliente Supabase configurado com sucesso.');
