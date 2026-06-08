const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://qqzsjsfzftdjieaqejly.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxenNqc2Z6ZnRkamllYXFlamx5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA5MzAwNCwiZXhwIjoyMDg1NjY5MDA0fQ.xLMSSLTsA2yAsWe8rkZLJczVfFd45ZLalTmBaIy763o'
);

async function main() {
  const { data, error } = await supabase
    .from('partial_payment_settings')
    .select('*');
  console.log(JSON.stringify(data, null, 2));
}
main();
