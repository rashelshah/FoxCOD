require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkOrders() {
  const { data, error } = await supabase
    .from("order_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
    
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Recent Orders in Supabase:");
    data.forEach(o => {
      console.log(`- Shop: ${o.shop_domain}, OrderID: ${o.shopify_order_id}, IsPartialCOD: ${o.is_partial_cod}, Advance: ${o.advance_amount}, Remaining: ${o.remaining_cod_amount}, Final Total: ${o.final_total}`);
    });
  }
}

checkOrders();
