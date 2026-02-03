import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Fox COD</h1>

        <p className={styles.text}>
          One-click Cash on Delivery checkout for Shopify stores.
        </p>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Enter your store domain</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder="your-store.myshopify.com"
              />
            </label>

            <button className={styles.button} type="submit">
              Connect Store
            </button>
          </Form>
        )}

        <ul className={styles.list}>
          <li>
            <strong>Universal COD Form</strong> – Customers place orders using a
            single fast form.
          </li>

          <li>
            <strong>Reduce Checkout Friction</strong> – Skip long Shopify
            checkout steps.
          </li>

          <li>
            <strong>Seller Dashboard</strong> – Manage COD orders in one place.
          </li>
        </ul>
      </div>
    </div>
  );
}