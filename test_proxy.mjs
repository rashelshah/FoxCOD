import fetch from 'node-fetch';

const proxyUrl = "https://fox-cod-test.myshopify.com/apps/fox-cod/create-order";

const payload = {
  shop: "fox-cod-test.myshopify.com",
  productId: "44225448738839", // just testing
  variantId: "47707203567852",
  quantity: 1,
  price: "10.00",
  shippingPrice: 0,
  discountPercent: 0,
  paymentMethod: "full_cod",
  customerName: "Test User",
  customerPhone: "9999999999",
  customerEmail: "test@example.com",
  customerAddress: "123 Test St",
  customerCity: "Test City",
  customerState: "TS",
  customerZipcode: "123456",
  customerCountry: "IN"
};

async function run() {
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
}
run();
