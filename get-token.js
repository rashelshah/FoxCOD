import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('shopify_sessions')
    .select('*')
    .eq('shop', 'fox-cod-dev.myshopify.com')
    .limit(1);
    
  if (error) console.error(error);
  else console.log(JSON.stringify(data[0], null, 2));
}

run();
