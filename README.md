# CA Affordable Homes — Website Guide

Welcome! This guide explains how to manage your website without touching any code. Everything is written in plain language — no technical background needed.

---

## Table of Contents

1. [How Your Listings Work](#how-your-listings-work)
2. [Setting Up Your Google Sheet](#setting-up-your-google-sheet)
3. [Connecting Your Sheet to the Website](#connecting-your-sheet-to-the-website)
4. [Managing Your Listings (Day-to-Day)](#managing-your-listings-day-to-day)
   - [Adding a New Property](#adding-a-new-property)
   - [Removing a Sold or Closed Listing](#removing-a-sold-or-closed-listing)
   - [Marking a Property as "Coming Soon"](#marking-a-property-as-coming-soon)
5. [Column Reference Guide](#column-reference-guide)
6. [Sample Listings (Ready to Use)](#sample-listings-ready-to-use)
7. [Connecting Your Contact Forms to Email](#connecting-your-contact-forms-to-email)
8. [How to Make Other Changes](#how-to-make-other-changes)
9. [Important Notes](#important-notes)

---

## How Your Listings Work

Your property listings on the "Available Homes" page are powered by a **Google Sheet that you own and control**. Here's how it works:

- You manage all your listings directly in Google Sheets — like a spreadsheet you already know how to use
- When you save changes to your sheet, those changes appear on the website within a few minutes (usually 1–5 minutes)
- No coding required — ever
- You can add properties, remove sold ones, and update details any time you like

---

## Setting Up Your Google Sheet

### Step 1: Create a new Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and sign in with your Google account
2. Click the **"+"** button to create a new blank spreadsheet
3. Give it a name — something like **"CA Affordable Homes Listings"**

### Step 2: Add the Column Headers (very important — exact spelling required)

In **Row 1** of your spreadsheet, type these headers **exactly as shown** — spelling and capitalization matter:

| Column A | Column B | Column C | Column D | Column E | Column F | Column G | Column H | Column I | Column J | Column K | Column L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Property Name | Address | City | Price | Bedrooms | Bathrooms | Sqft | Status | Description | Photo URL | AMI Range | Program Type |

**Tip:** You can copy and paste the header row from below directly into Row 1:

```
Property Name	Address	City	Price	Bedrooms	Bathrooms	Sqft	Status	Description	Photo URL	AMI Range	Program Type
```

### Step 3: Add Sample Data

Your spreadsheet comes with 3 sample rows to show you the format. Copy the rows below into your sheet (Rows 2, 3, and 4):

**Row 2 — Available listing example:**
- Property Name: `Sunrise Bungalow`
- Address: `1234 Maple St`
- City: `Sacramento`
- Price: `$245,000`
- Bedrooms: `3`
- Bathrooms: `2`
- Sqft: `1,150`
- Status: `Available`
- Description: `Charming starter home in a quiet neighborhood. Covered porch, updated kitchen.`
- Photo URL: `https://placehold.co/600x400/818b7e/f5f5f5?text=Sunrise+Bungalow`
- AMI Range: `60–80% AMI`
- Program Type: `First-Time Buyer`

**Row 3 — Coming Soon example:**
- Property Name: `Valley View Condo`
- Address: `890 Hillside Ave`
- City: `Fresno`
- Price: `$189,000`
- Bedrooms: `2`
- Bathrooms: `1`
- Sqft: `875`
- Status: `Coming Soon`
- Description: `Ground-floor unit with private patio. Close to transit and schools.`
- Photo URL: `https://placehold.co/600x400/818b7e/f5f5f5?text=Valley+View+Condo`
- AMI Range: `50–70% AMI`
- Program Type: `Down Payment Assistance`

**Row 4 — Closed listing example (hidden from website):**
- Property Name: `Eastside Cottage`
- Address: `567 Oak Lane`
- City: `Stockton`
- Price: `$212,000`
- Bedrooms: `3`
- Bathrooms: `1`
- Sqft: `1,020`
- Status: `Closed`
- Description: `SAMPLE — delete this row or change Status to Available to display`
- Photo URL: `https://placehold.co/600x400/818b7e/f5f5f5?text=Eastside+Cottage`
- AMI Range: `70–100% AMI`
- Program Type: `First-Time Buyer`

---

## Connecting Your Sheet to the Website

This is a one-time setup step. Once done, you won't need to do it again.

### Step 1: Publish your sheet to the web

1. In Google Sheets, click **File** in the top menu
2. Click **Share**, then **Publish to web**
3. In the window that appears:
   - Under "Link", make sure **"Entire Document"** is selected in the first dropdown
   - In the second dropdown, change it from "Web page" to **"Comma-separated values (.csv)"**
4. Click the **"Publish"** button
5. A URL will appear — it will look something like:
   `https://docs.google.com/spreadsheets/d/LONG-ID-HERE/pub?output=csv`
6. **Copy that URL** (click it, then Ctrl+A / Cmd+A to select all, then copy)

### Step 2: Paste the URL into your website

1. Open the file **`js/listings.js`** in a text editor (your web developer can do this if you're not comfortable)
2. Find this line near the top of the file:
   ```javascript
   const SHEET_CSV_URL = 'PASTE_YOUR_GOOGLE_SHEET_CSV_URL_HERE';
   ```
3. Replace `PASTE_YOUR_GOOGLE_SHEET_CSV_URL_HERE` with the URL you copied, keeping the single quote marks:
   ```javascript
   const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/YOUR-ACTUAL-ID/pub?output=csv';
   ```
4. Save the file and upload it to your website

That's it! Your listings will now appear on the Available Homes page.

---

## Managing Your Listings (Day-to-Day)

### Adding a New Property

1. Open your Google Sheet
2. Click on the **first empty row** below your existing listings
3. Fill in each column with the property details (see the Column Reference Guide below)
4. Make sure the **Status column** says either `Available` or `Coming Soon`
5. Save the sheet (Ctrl+S or Cmd+S, or it auto-saves)
6. **Within a few minutes**, the new listing will appear on the website

**Note:** If you don't have a real photo yet, you can use a placeholder image URL like:
`https://placehold.co/600x400/818b7e/f5f5f5?text=Your+Property+Name`
(Replace "Your+Property+Name" with the actual name, using + signs instead of spaces)

### Removing a Sold or Closed Listing

You have two options:

**Option A — Change the Status to "Closed"** *(recommended)*
1. Find the row for the property that sold
2. In the **Status column**, change the value to `Closed`
3. Save the sheet
4. The listing will disappear from the website within a few minutes
5. The row stays in your sheet as a record — you can look back at it later

**Option B — Delete the row entirely**
1. Right-click on the row number on the left side of the sheet
2. Click **"Delete row"**
3. Save the sheet
4. The listing disappears from the website within a few minutes

### Marking a Property as "Coming Soon"

1. Find the row for the property (or add a new row)
2. In the **Status column**, type exactly: `Coming Soon`
3. Save the sheet
4. The property will appear on the website with a gray "Coming Soon" badge instead of the green "Available" badge

---

## Column Reference Guide

Here's what each column means and what to put in it:

| Column | What to Enter | Example |
|---|---|---|
| **Property Name** | The name you want displayed on the website | Sunrise Bungalow |
| **Address** | Street address of the property | 1234 Maple St |
| **City** | City where the property is located | Sacramento |
| **Price** | Listing price, formatted how you want it to appear | $245,000 |
| **Bedrooms** | Number of bedrooms (just the number) | 3 |
| **Bathrooms** | Number of bathrooms (just the number) | 2 |
| **Sqft** | Square footage (just the number, no "sq ft") | 1150 |
| **Status** | Must be one of three exact values — see below | Available |
| **Description** | A short description of the property | Charming starter home in a quiet neighborhood. |
| **Photo URL** | A direct link to the property photo — see tips below | https://... |
| **AMI Range** | The income range this property targets | 60–80% AMI |
| **Program Type** | The type of program or assistance offered | First-Time Buyer |

### Status Values (exact spelling required)

| What to Type | What It Does |
|---|---|
| `Available` | Shows on the website with a green "Available" badge |
| `Coming Soon` | Shows on the website with a gray "Coming Soon" badge |
| `Closed` | **Hidden from the website** — use this when a property is sold or off-market |

### Photo URL Tips

The photo must be a **direct link to an image** — meaning if you open the link in a browser, you see only the photo (not a web page around it).

**Good options:**
- **Google Drive:** Upload your photo to Google Drive, right-click → "Get link" → "Anyone with the link" → copy the link. Then change the URL format from `https://drive.google.com/file/d/FILE_ID/view?usp=sharing` to `https://drive.google.com/uc?id=FILE_ID` (replace FILE_ID with the actual ID in the URL)
- **Any public image host:** Imgur, Cloudinary, or similar services give you direct image URLs
- **Placeholder:** Use `https://placehold.co/600x400/818b7e/f5f5f5?text=Property+Name` as a temporary placeholder

---

## Sample Listings (Ready to Use)

Here is a copy-paste ready version of the three sample rows. You can use these as templates for your real listings:

```
Property Name,Address,City,Price,Bedrooms,Bathrooms,Sqft,Status,Description,Photo URL,AMI Range,Program Type
Sunrise Bungalow,1234 Maple St,Sacramento,$245000,3,2,1150,Available,"Charming starter home in a quiet neighborhood. Covered porch, updated kitchen.",https://placehold.co/600x400/818b7e/f5f5f5?text=Sunrise+Bungalow,60–80% AMI,First-Time Buyer
Valley View Condo,890 Hillside Ave,Fresno,$189000,2,1,875,Coming Soon,"Ground-floor unit with private patio. Close to transit and schools.",https://placehold.co/600x400/818b7e/f5f5f5?text=Valley+View+Condo,50–70% AMI,Down Payment Assistance
Eastside Cottage,567 Oak Lane,Stockton,$212000,3,1,1020,Closed,"SAMPLE — delete this row or change Status to Available to display",https://placehold.co/600x400/818b7e/f5f5f5?text=Eastside+Cottage,70–100% AMI,First-Time Buyer
```

---

## Connecting Your Contact Forms to Email

Your website has contact forms (on the Contact page and Available Homes page) that send inquiries directly to your email. These use a free service called **Formspree**.

### First-time setup:

1. Go to [formspree.io](https://formspree.io) and create a free account (use your email address)
2. Once logged in, click **"New Form"**
3. Give it a name (e.g., "Buyer Pre-Screening") and click **"Create Form"**
4. Formspree will give you an endpoint URL that looks like:
   `https://formspree.io/f/abcdefgh`
5. **Copy that URL**

### Connecting the form on contact.html (Buyer form):

1. Open `contact.html` in a text editor
2. Find this comment: `<!-- FORMSPREE: Replace the action URL below with your Formspree endpoint for the buyer form -->`
3. On the line below it, change the `action` value to your Formspree URL:
   ```html
   action="https://formspree.io/f/YOUR_ACTUAL_ID"
   ```
4. Repeat steps 2–4 in Formspree to create a **second form** for "Partner Inquiries"
5. Find the comment for the partner form and update it the same way

### Connecting the Notify Me form on homes.html:

1. Create a third Formspree form called "Notify Me Sign-Ups"
2. Open `homes.html` in a text editor
3. Find the comment: `<!-- FORMSPREE: Replace the action URL below with your Formspree endpoint -->`
4. Update that form's `action` attribute with the new URL

**Important:** Formspree's free tier allows **50 form submissions per month**. This is more than enough to get started. If you receive more than 50 inquiries per month, you can upgrade to their paid plan (currently $10/month) which allows unlimited submissions.

---

## How to Make Other Changes

| What you want to change | How to do it |
|---|---|
| **Listings** (add, edit, remove) | Update your Google Sheet — no code needed |
| **Contact forms** | Update Formspree (see above) |
| **Colors, fonts, layout** | Requires editing `css/styles.css` — contact your web developer |
| **Page text and content** | Requires editing the HTML files — contact your web developer |
| **Navigation links** | Requires editing HTML — contact your web developer |
| **Logo or branding** | Requires editing HTML/CSS — contact your web developer |

**For any changes beyond listings and forms, contact your web developer.**

---

## Important Notes

### Your Google Sheet is public

When you publish your Google Sheet to the web (the CSV step), **anyone who has the link can view the data in it**. This is required for the website to work.

✅ This is fine for listing information (property names, prices, descriptions, photos)
❌ Do **not** put any private information in this sheet — no buyer names, no personal data, no financials, no passwords

The sheet is for listing data only.

### Changes take a few minutes to go live

After you update your Google Sheet, it may take up to 5 minutes for changes to appear on the website. This is normal — it's not instant, but it's quick.

### Browser caching

If you update a listing and don't see the change right away, try holding **Shift** and clicking the Refresh button in your browser (Shift+Refresh). This forces the browser to reload the page fresh.

### The website is hosted on GoDaddy

Your website is hosted on GoDaddy. If you need to update the website files (not your Google Sheet), you'll need to upload them through the GoDaddy File Manager or ask your web developer to do it.

### Backups

Your Google Sheet is automatically saved and backed up by Google. For the website files, it's a good idea to keep a copy on your computer. Your web developer can help set this up.

---

*This guide was written for non-technical users. If something doesn't make sense or you need help, please reach out to your web developer. For changes to the listings system specifically, this guide should cover everything you need.*

**Web developer contact:** *(Add your developer's name and email here)*
