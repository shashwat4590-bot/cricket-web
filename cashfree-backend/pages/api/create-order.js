import axios from "axios"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.https://rogxkddufkmjexekwzzr.supabase.co,
  process.env.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ3hrZGR1ZmttamV4ZWt3enpyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQ5NDAyNiwiZXhwIjoyMDg5MDcwMDI2fQ.4CS9ItTg7Q_v9AxeN0ijxOia87Q0oZwrRbl5bKDoMuM
)

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" })
    }

    const { user_id, amount } = req.body

    if (!user_id || !amount) {
      return res.status(400).json({ error: "Missing data" })
    }

    const order_id = "order_" + Date.now()

    // Save order
    await supabase.from("orders").insert([
      {
        order_id,
        user_id,
        amount,
        status: "pending"
      }
    ])

    // Create order in Cashfree
    const response = await axios.post(
      "https://sandbox.cashfree.com/pg/orders",
      {
        order_id,
        order_amount: amount,
        order_currency: "INR",
        customer_details: {
          customer_id: user_id,
          customer_email: "test@test.com",
          customer_phone: "9999999999"
        }
      },
      {
        headers: {
          "x-client-id": process.env.CASHFREE_APP_ID,
          "x-client-secret": process.env.CASHFREE_SECRET,
          "x-api-version": "2022-09-01"
        }
      }
    )

    return res.status(200).json({
      payment_session_id: response.data.payment_session_id
    })

  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Server error" })
  }
}
