import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function run() {
  const { data, error } = await supabase.from('form_settings').select('shop_domain, form_title, form_subtitle, submit_button_text').order('created_at', { ascending: false }).limit(5);
  console.log("Error:", error);
  console.log("Settings in Supabase:", data);
}
run();
