const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data } = await supabase.from('partial_payment_settings').select('shop_domain, excluded_countries, allowed_countries');
  console.log(JSON.stringify(data, null, 2));
}
check();
