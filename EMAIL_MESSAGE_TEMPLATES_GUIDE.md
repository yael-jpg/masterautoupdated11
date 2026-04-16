# Email Message Templates Configuration

## Overview

Email message templates in Configuration allow you to customize and centralize all promotional, PMS reminder, and subscription renewal messages. These templates **automatically connect** to email campaigns, so you only edit them once and they apply everywhere.

## How It Works

### Configuration → Email Campaigns → Auto-Connect

```
1. Admin edits message template in Configuration
   ↓
2. Template saved to database
   ↓
3. When email campaign sends, it pulls template from Configuration
   ↓
4. Message appears in customer's inbox with your custom text
```

## Three Message Categories

### 1. 🎁 Promo Code Email Messages

**When Used:** 
- Email campaigns linked to promo codes
- Promotional offers sent to customers

**Template Fields:**

| Field | Purpose | Example |
|-------|---------|---------|
| **Enabled** | Toggle promo messages on/off | true/false |
| **Subject** | Email subject line | "Exclusive Offer — {percent}% Off" |
| **Greeting** | Opening message | "Hey {customer_name}! We have an exclusive offer..." |
| **Reminders** | Terms & conditions (one per line) | "Valid for {days} days only" |
| **Closing** | Call-to-action | "Don't miss out! Claim your discount today" |

**Placeholder Variables:**
```
{customer_name}    - Recipient's name
{code}            - Promo code string (e.g., "SUMMER20")
{percent}         - Discount percentage (e.g., "20")
{amount}          - Discount amount in currency (e.g., "₱500")
{days}            - Days valid remaining
{min_purchase}    - Minimum purchase amount required
```

**Example Setup:**

```
Subject: Exclusive Summer 2024 Deal — {percent}% Off

Greeting:
Hi {customer_name}! 🚗

Your exclusive promo code is: {code}

Use it for {percent}% off any service this month!

Reminders (one per line):
- Valid for {days} days only
- Minimum purchase of ₱{min_purchase} required
- Cannot combine with other offers
- Use code {code} at checkout

Closing:
Book your appointment today and enjoy premium service at exclusive prices.
Thank you for being a valued customer! 🙌
```

---

### 2. 🔧 PMS Reminder Email Messages

**When Used:**
- Preventive Maintenance Service reminders
- Auto-sent when vehicle reaches scheduled maintenance

**Template Fields:**

| Field | Purpose | Example |
|-------|---------|---------|
| **Enabled** | Send PMS reminder emails | true/false |
| **Subject** | Email subject | "PMS Reminder for {plate_number}" |
| **Greeting** | Service reminder message | "Your vehicle {plate_number} is due for PMS" |
| **Reminders** | Important maintenance tips | "Delaying PMS affects warranty" |
| **Closing** | Call-to-action | "Book your appointment now" |

**Placeholder Variables:**
```
{plate_number}         - Vehicle plate number (e.g., "ABC123")
{package_name}         - PMS package name (e.g., "Full Service Package")
{kilometer_interval}   - Service interval in km (e.g., "10,000")
{last_service_date}    - Date of last service
```

**Example Setup:**

```
Subject: It's Time for Maintenance — Your {plate_number} PMS Reminder

Greeting:
Hello! This is a friendly reminder that your vehicle with plate number {plate_number}, 
which is availed under {package_name}, is due for its preventive maintenance service.

Reminders (one per line):
- Your last service was on {last_service_date}
- Delaying PMS may affect your vehicle warranty
- Scheduling in advance helps avoid long waiting times
- Your next service is due at {kilometer_interval}km

Closing:
Book your PMS appointment today to keep your vehicle running smoothly and maintain 
full warranty coverage. Our team is ready to serve you!
```

---

### 3. 💳 Subscription Renewal Reminder Messages

**When Used:**
- Subscription renewal reminders
- Sent 5 days before expiry AND after expiration

**Template Fields:**

| Field | Purpose | Example |
|-------|---------|---------|
| **Enabled** | Send renewal reminders | true/false |
| **Subject** | Email subject | "Your {package_name} is expiring" |
| **Greeting** | Renewal urgency message | "Your subscription is about to expire" |
| **Reminders** | Benefits of renewal | "Renewal costs just 5 minutes" |
| **Closing** | Renewal call-to-action | "Renew now to keep coverage" |

**Placeholder Variables:**
```
{customer_name}    - Subscriber's name
{package_name}     - Subscription package name (e.g., "Premium Protection")
{plate_number}     - Vehicle plate number
{status}           - Subscription status ("expiring soon" or "expired")
{end_date}         - Subscription expiration date
{days_left}        - Days remaining until expiration
```

**Example Setup:**

```
Subject: Your {package_name} Subscription is {status} — Renew Now!

Greeting:
Hi {customer_name}!

Your {package_name} subscription for {plate_number} is {status}.

Don't lose your coverage! Renew now to maintain all your exclusive benefits and priority service.

Reminders (one per line):
- Subscription expires on {end_date} ({days_left} days left)
- Renewal takes less than 5 minutes
- All benefits cease immediately after expiration
- Early renewal is available anytime
- You can upgrade to a better package during renewal

Closing:
Keep your {package_name} active and enjoy continuous coverage, priority service, 
and exclusive member benefits. Renew your subscription today!
```

---

## How to Use

### Step 1: Go to Configuration
In the admin dashboard → **Configuration** → Select the tab for your message:
- 🎁 **Promo Codes** (for promotional offers)
- 📧 **Booking** (for booking confirmations) / **PMS Email** (for maintenance reminders)
- 📧 **Subscription** (for renewal reminders)

### Step 2: Edit Message Fields
Each message has these editable fields:
1. **Enabled** - Toggle on/off with a switch
2. **Subject** - Type the email subject line (use placeholder variables for personalization)
3. **Greeting** - Opening message of the email
4. **Reminders** - Important points (one per line = one bullet point)
5. **Closing** - Final call-to-action message

### Step 3: Use Placeholders
Insert curly braces `{}` around placeholder names:
- `{customer_name}` = recipient's first name
- `{code}` = promo code
- `{percent}` = discount percentage
- `{plate_number}` = vehicle plate
- `{package_name}` = service/subscription package
- See each section above for full list

### Step 4: Preview (Optional)
The system will show how your message looks with sample placeholders filled in.

### Step 5: Save
Click **Save** - settings are auto-saved as you type. The change is logged in the audit trail.

---

## Connection to Email Campaigns

### How Promo Messages Connect

When you create an **Email Campaign** with a promo code:

```
1. Admin clicks "Create Email Campaign"
   ↓
2. Selects a "Promo Code" from the dropdown
   ↓
3. Email template fields auto-populate from Configuration:
   - Subject from "promo" → "subject"
   - Greeting from "promo" → "greeting"
   - Reminders from "promo" → "reminders"
   - Closing from "promo" → "closing"
   ↓
4. Admin can edit for this specific campaign (optional)
   ↓
5. When campaign sends, customer receives email with:
   - Your configured subject
   - Your configured message
   - Placeholder values filled in (code=SUMMER20, percent=20, etc.)
```

**Example Email Received by Customer:**
```
Subject: Exclusive Offer — 20% Off Your Next Service

Hi John! 🚗

Your exclusive promo code is: SUMMER20

Use it for 20% off any service this month!

⚠️ Important Reminders
• Valid for 30 days only
• Minimum purchase of ₱1,500 required
• Cannot combine with other offers
• Use code SUMMER20 at checkout

Book your appointment today and enjoy premium service at exclusive prices.
Thank you for being a valued customer! 🙌

---
Best regards,
MasterAuto Team
```

---

## Default Messages

The system comes with sensible defaults for each message type. You can:

✅ **Edit Defaults** - Change globally (affects all new campaigns)
✅ **Override Per Campaign** - Create custom version for specific campaign
✅ **Reset to Defaults** - Click "Reset" button to restore system defaults

---

## Best Practices

### ✅ Do's
- **Use placeholder variables** - Makes emails personal (`{customer_name}` instead of "Dear Customer")
- **Keep it concise** - 3-4 bullet points max in Reminders section
- **Be specific** - Use exact discount amounts or codes
- **Include CTA** - Always have a clear call-to-action in Closing
- **Test** - Send test email to yourself before bulk campaign

### ❌ Don'ts
- **Don't hardcode values** - Use `{code}` not "SUMMER20" (allows reuse)
- **Don't repeat** - No need to mention code twice if already in greeting
- **Don't make assumptions** - "Expires in 5 days" can be wrong; use `{days}` instead
- **Don't skip placeholders** - Generic messages have lower conversion
- **Don't forget tone** - Match your brand voice (friendly, professional, etc.)

---

## Audit Trail & Compliance

Every message edit is logged with:
- Who changed it (admin name)
- When it was changed (timestamp)
- What changed (old vs new value)
- Why (edit reason if provided)

View in **Configuration** → **Audit Logs** tab

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Message not sending | Check "Enabled" toggle is ON for that category |
| Placeholders not filled | Ensure placeholder name matches exactly (case-sensitive) |
| Old message still showing | Clear browser cache or refresh page |
| Template locked/not editable | Check your role has edit permission (Admin+) |
| Placeholder showing as blank | Data may be missing (e.g., customer_name not in database) |

---

## Upcoming Features

- 📧 **Email preview** - See how message looks before campaign sends
- 🎨 **Template designer** - Visual editor with drag-drop
- 📊 **Performance analytics** - Track opens, clicks per template
- 🔄 **A/B testing** - Test different message variations
