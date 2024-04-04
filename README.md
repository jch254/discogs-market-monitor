# [Discogs Wantlist Marketplace Monitor](https://603.nz)

![Build Status](https://codebuild.ap-southeast-2.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiUDhXeDRQQlY5UXRDRDY1RHVDSm5sK1d6TEp0UDR0QTl3QXE4V0NoZkZKZFZ6SVp3WUJBSFVtdW9iMm5CQlVzbVl5b2hHZi8zUEptZGMzdmo3b0JOcHlZPSIsIml2UGFyYW1ldGVyU3BlYyI6Inh5aTgyT0NBa2VnVmxtVFkiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=master)

Discogs Wantlist Marketplace Monitor powered by Serverless, TypeScript, Webpack and Node.js. The monitor scans the Discogs Marketplace for listings from the specified user's wantlist in the specified countries and sends a digest email of all matching listings to the specified email address. It runs as an AWS Lambda function (scheduled every twelve hours). This saves manually searching through your wantlist for local listings.

## Technologies Used

- [Serverless](https://github.com/serverless/serverless)
- [TypeScript](https://github.com/microsoft/typescript)
- [Node.js](https://github.com/nodejs/node)
- [Webpack](https://github.com/webpack/webpack)
- [Serverless-webpack](https://github.com/elastic-coders/serverless-webpack)
- [Disconnect](https://github.com/bartve/disconnect)
- [@sendgrid/mail](https://github.com/sendgrid/sendgrid-nodejs/tree/main/packages/mail)

## Example email digest

<details>
  <summary>
    Example digest email shipping from Australia and New Zealand (currently JSON dump)
  </summary>

```
[
  {
    "artist": "Blakroc",
    "title": "Blakroc",
    "price": "A$649.99",
    "shippingPrice": "TBC",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW9gN8-2B5jB5gVtnTIZormXxBzn6ZIJfiHvf0SpqcoRd4ww-3D-3Difwg_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEynwO6wb4WwHWkUoitt1szutnb8omBzLuYFKS-2Fs-2Fcm5oydfpJr6Y7BGD8cYWlHviBBuEf1dolsTZOboHVoy9HI0cZgxNkZEbCIS4-2FlW8t-2FDWg72Hr0wcLgEEg8v9toeNsfUSulg1onleyaKzN2y-2BTfQ-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Mint (M)",
    "comments": "Factory Sealed. Australian seller. Indie Record Store",
    "posted": "2023-06-25T20:16:11-07:00",
    "description": "Blakroc - Blakroc (LP, Album + CD, Album)",
    "format": "LP, Album + CD, Album",
    "year": 2009,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Black Milk",
    "title": "If There's A Hell Below",
    "price": "A$200.00",
    "shippingPrice": "80 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2FxnMPsxpSKeCZFDcJ-2BomHe7t3lwhdZZx5O2XPiKn-2BaVw-3D-3DlBej_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEp406EX-2F1jgXmbI1l4ePHWHu1W1MNwyiF7iuxrg2Hjk5xJRS3WbuXDm9Kcp4MVzaPwkroC8Cp9oYSy6SAA-2FWHhV-2BPQTro9w-2BiNS4-2BsCzKjycokzzN7l0SAyi9Y1L-2BNNInxXDdiAzOFP0AUjr6-2BmylMw-3D-3D
    "condition": "Near Mint (NM or M-)",
    "sleeveCondition": "Very Good Plus (VG+)",
    "comments": "SIGNED BY BLACK MILK on red sleeve. Sleeve is very close to NM but has a squashed corner. Vinyl unplayed.",
    "posted": "2022-08-05T14:52:25-07:00",
    "description": "Black Milk - If There's A Hell Below (2xLP, Album)",
    "format": "2xLP, Album",
    "year": 2014,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Ólafur Arnalds & Nils Frahm",
    "title": "Loon",
    "price": "A$39.00",
    "shippingPrice": "45 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2F5JXMLZKto6fmbICxfExF9yt47oNKDU1XCwT1q2bshkA-3D-3DnA_k_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEc0exYICTphZMkKaJlgfh720n-2FfXI8PguzeOgz38fgcNSJHFifwzN9Cd-2BP-2ByJFjnuUMmOWzTkT6rE6OOwhkNnPqHiOw3Z6v4ZzigXpMYKeiwCVmNXINVpAUiCqnEU-2FEKR1xkY-2B80HaS3plaFO-2BlV-2BwA-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Mint (M)",
    "comments": "New, Factory Sealed! ----- contact for full stocklist and deals ---- Free Pickup in Brisbane",
    "posted": "2024-03-31T18:31:02-07:00",
    "description": "Ólafur Arnalds & Nils Frahm - Loon (12\", EP)",
    "format": "12\", EP",
    "year": 2015,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Curren$y, Freddie Gibbs, Alchemist",
    "title": "Fetti ",
    "price": "NZ$450.00",
    "shippingPrice": "TBC",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2F0WWoR4f38bZIqkg04OvxslLaUIVj85eWSl1uSRi1g7Q-3D-3Di9Kc_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEP2kiIVvWb1I0fkMlzzR7sIbkpTC5Nxfix-2FXmeONYR7ZYxR55UJdePOoToDcVUphk1lMuF3Es17UKQhVeeBoJW4sJ939WuEkjKkiygQ9hEesFscOTPmBeEtLpZsi9MAfzq85ZqALc-2FtWukwIHuIqf5w-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Very Good (VG)",
    "comments": "Unplayed. Creased corner (arrived like that). Signed by Freddie Gibbs!",
    "posted": "2023-10-02T17:20:51-07:00",
    "description": "Curren$y, Freddie Gibbs, Alchemist - Fetti  (LP, Album, RSD, Ltd, Yel)",
    "format": "LP, Album, RSD, Ltd, Yel",
    "year": 2019,
    "shipsFrom": "New Zealand"
  },
  {
    "artist": "Pusha T",
    "title": "King Push – Darkest Before Dawn: The Prelude",
    "price": "A$95.00",
    "shippingPrice": "40 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2B16OLv1ONswP6Wod1IFGoZZy4V9u0gHwI21AgMRpL1YA-3D-3DFhs5_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgE4jiEUKR-2FHB4K6EFgwG6fgESLQV5nZLWnHwXxPVboy1p4NBYtCZ8CxxODWxCfoCLsNeY-2F9M-2BfWgZxf3OPkDYQJGDeSW16HvEOe0u4VGosCTYXpB5ZyIh-2BIjW-2FFvDqKn9NIUATRaR1ylAxpmMP1SaqJA-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Mint (M)",
    "comments": "Mint and sealed",
    "posted": "2023-10-19T01:30:09-07:00",
    "description": "Pusha T - King Push – Darkest Before Dawn: The Prelude (LP, Album)",
    "format": "LP, Album",
    "year": 2016,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Pusha T",
    "title": "King Push – Darkest Before Dawn: The Prelude",
    "price": "A$96.00",
    "shippingPrice": "30 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW95fQ-2Boo347Z2Gq-2FL-2FfY7fgHNav9vkiSYCbU7FT6UT2oQ-3D-3DFgj8_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEkjZ4I6tbAGNHHQermbO8FYG7YuGHd5Gzm7jY49vJoZT7qYUVlRBdlSpy-2B0NnEMy8PPmY9iKMdTrXPviMpW8r1BA7JFiGVu8pV7oXCoeWlexeGScmq1ETfKfEYtFuajkjzOxdgamyYEGQJ4GRWe59zQ-3D-3D
    "condition": "Near Mint (NM or M-)",
    "sleeveCondition": "Very Good Plus (VG+)",
    "comments": "INCLUDING INSERT. www.shoesonawire.com",
    "posted": "2024-03-06T18:19:15-08:00",
    "description": "Pusha T - King Push – Darkest Before Dawn: The Prelude (LP, Album)",
    "format": "LP, Album",
    "year": 2016,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Allah-Las",
    "title": "Allah-Las",
    "price": "A$110.00",
    "shippingPrice": "40 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2BMYg3yHkhNtD4QsU-2FhD1DhUXVi1yxqUIjIFObcjSjVbQ-3D-3DrT9e_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEApduvM9ztb3SDN1a3pdf48NJ7IaWOW8LDuO6S4xVwCbbHUNiTgP0pr-2FLDi0SvU-2FFDIyYLwSstB8Z9PoYeFTnYmI7g-2FLkk1CEJW3hfkukTRcgzfN2w47-2FpDUab-2FCxJUgisj41QL2-2BmLL1GLofKqnEvQ-3D-3D
    "condition": "Very Good Plus (VG+)",
    "sleeveCondition": "Very Good Plus (VG+)",
    "comments": "Sleeve close to NM but has tiny corner dents on the right side. Vinyl in good condition, nothing of note. HD images available on request",
    "posted": "2023-12-18T20:57:26-08:00",
    "description": "Allah-Las - Allah-Las (LP, Album)",
    "format": "LP, Album",
    "year": 2012,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Allah-Las",
    "title": "Allah-Las",
    "price": "A$99.00",
    "shippingPrice": "TBC",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2F6npaqamQ8Z-2B97i6A1GLTUdMN2fw6wpuhUgkmQ0zhc8g-3D-3DW3v4_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEGtDysoZOvXxZnCbnZ11q9rO8I89fIwrKpucPv8coyW-2FLR42lR2Tyvc9jOawZO72RtJgYZv4IIxTDByEcieawVFc4RCLWv33nWh15rKf5jmQINwD-2BoZ8mwFBBqtaGUV0RCn-2BX9ukR-2Brj-2BQKRl4VcRaw-3D-3D
    "condition": "Very Good Plus (VG+)",
    "sleeveCondition": "Very Good Plus (VG+)",
    "comments": "Minor scuff on record, doesn't affect play \nCover in VG+ condition with minor creasing with age ",
    "posted": "2024-02-12T16:03:28-08:00",
    "description": "Allah-Las - Allah-Las (LP, Album)",
    "format": "LP, Album",
    "year": 2012,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Fly My Pretties",
    "title": "The Studio Recordings Part 2",
    "price": "NZ$49.00",
    "shippingPrice": "70 NZD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2F-2BJahGTzDH2v-2Bm0dwk4QIek5q4hDCy8fsaXqZ8dq7AcA-3D-3DxtiU_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEhW22US-2FBsBzz3oBg8yXAmsnf6pxNxw95UgHB1sTdtjLSMK2PNyDLW7ghV-2FRD6KS511m-2FyTdkpyw8-2B8ztfR-2FJQzXnD2sQ30U3MHlZBYUM-2BpQyn7vjXPrjd3Xx7RIOFHRS2Yx9dgpcwf-2Blyy3qahdlJA-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Mint (M)",
    "comments": "Fly My Pretties ‎– The Studio Recordings Par 2",
    "posted": "2022-11-20T19:55:27-08:00",
    "description": "Fly My Pretties - The Studio Recordings Part 2 (LP, Album)",
    "format": "LP, Album",
    "year": 2020,
    "shipsFrom": "New Zealand"
  },
  {
    "artist": "Real Bad Man",
    "title": "On High Alert Volume 1",
    "price": "A$56.16",
    "shippingPrice": "26 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2B7bwAsQpark6sm7uavk5UFLrFk-2FhqH18U-2BzFJpA-2FXRdw-3D-3D5rFJ_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEwtzGH-2BE70UCzqpL-2F2BFXvO6O1BCE5-2BU-2F6zEON-2BOhAWC-2BFfTr80CZDj6Bwp9f73lOFtAsYEaiX6HbivyzoKVd4Lt-2FaaUN3JwVmIwKfSlppwYKNNq634y8UqJ7yLLf6KnBIoC9C3rJ9gG-2BovHDXnA4Cw-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Mint (M)",
    "comments": "",
    "posted": "2022-10-30T05:59:14-07:00",
    "description": "Real Bad Man - On High Alert Volume 1 (12\", MiniAlbum)",
    "format": "12\", MiniAlbum",
    "year": 2020,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Jay-Z",
    "title": "Kingdom Come",
    "price": "A$165.00",
    "shippingPrice": "49 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW9ITPZONt5lGCqbPOovYQ8d5J6OndH9PO1lZ9RSsrnQBw-3D-3DW2cL_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEF4tzXwTMtJ0iIj6oIyw3AYk5CgTMjj6vYfg0d6D5VcdDUAc7ZSqCBZOKsVF5MbtFtvEbT3KgOa7LLsRzubj4pg8svou1v2rRECPTtplMGMVXg-2FGf-2BaVKYj0EDOoTaJqpJInxoAjI3wyAyISNhbhQAA-3D-3D
    "condition": "Near Mint (NM or M-)",
    "sleeveCondition": "Near Mint (NM or M-)",
    "comments": "OG US. SLEEVE IN SHRINK WITH HYPE STICKER. RECORDS VG++ TO NM. INCLUDING INSERT. www.shoesonawire.com",
    "posted": "2024-03-04T17:57:49-08:00",
    "description": "Jay-Z - Kingdom Come (2xLP, Album)",
    "format": "2xLP, Album",
    "year": 2006,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Ghostface Killah And Adrian Younge",
    "title": "Twelve Reasons To Die ",
    "price": "NZ$48.00",
    "shippingPrice": "45 NZD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW81EOaKfEYbo2KieD1Z5zoG4hT07MqjsZGtThthUECBRQ-3D-3Detcr_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgE5VWR6EQlHKqk1w-2FQhfCi6FokzR0xptj4CqeSlld3L0Yr9Vu1pmsDy-2FfQ-2Fi3J38EvhTMzvojUGjwDk-2F0Z8sr-2ByvZ2O2S5wsIMqMYwyvQoW6bLuVr0WBChj2zzWKwV62AjWLaDW-2BJGg7A31aq4BthXpQ-3D-3D
    "condition": "Near Mint (NM or M-)",
    "sleeveCondition": "Near Mint (NM or M-)",
    "comments": "Played Once, Unsealed, Don't Send Payment Immediately As Shipping Price May Vary ",
    "posted": "2024-04-02T15:11:45-07:00",
    "description": "Ghostface Killah And Adrian Younge - Twelve Reasons To Die  (LP, Album)",
    "format": "LP, Album",
    "year": 2013,
    "shipsFrom": "New Zealand"
  },
  {
    "artist": "Jay-Z / Linkin Park",
    "title": "Collision Course",
    "price": "A$350.00",
    "shippingPrice": "60 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2BkXcSSg6l8v7T-2BLv87h8XE83OAYw3a2kCJ-2FWkSPlKAzQ-3D-3DYcko_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEv8fIc-2BPxPtAvSbkaDKe9nKzb8sdHUkV1LWU-2BMJlhOFddNiowrQ-2B7auQ4Z-2F38lcT-2FRoeUpqzGRlTWSswqZr-2FBijgTOZZtO-2BFe-2FH6pDwyxwJBA33ViwBrSnTE0U7oGWMM9joP6mL0z-2ByjzZ7vcBQg3Og-3D-3D
    "condition": "Near Mint (NM or M-)",
    "sleeveCondition": "Near Mint (NM or M-)",
    "comments": "Great condition, played handful of times. No warping or skipping. Doesn't include DVD",
    "posted": "2024-04-01T02:27:53-07:00",
    "description": "Jay-Z / Linkin Park - Collision Course (LP, RSD, Ltd, RE, Blu + DVD-V)",
    "format": "LP, RSD, Ltd, RE, Blu + DVD-V",
    "year": 2014,
    "shipsFrom": "Australia"
  },
  {
    "artist": "The Weeknd",
    "title": "Echoes Of Silence",
    "price": "A$95.00",
    "shippingPrice": "45 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW8XoXz-2FtMkrKTgAJk1lojZcjW9ah-2B9jefU186zr0AfEKQ-3D-3DN1Vi_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgETjN0JnvbI8-2Bt-2Fhsd5rqiWNIQ5y-2FEN273z6RdaNyfimowByCoolrrJEUc6COnhdJa9WYuXpu2R8AKe2FIm97sXeCK-2BgroBTeTz0pd1FlVBoPUXFFt11SWpYfkACR6ipXHZWArfShQQo957UsPwJIFHA-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Mint (M)",
    "comments": "New, Factory Sealed! ----- contact for full stocklist and deals ---- Free Pickup in Brisbane",
    "posted": "2024-03-31T18:31:02-07:00",
    "description": "The Weeknd - Echoes Of Silence (2xLP, Mixtape, RE)",
    "format": "2xLP, Mixtape, RE",
    "year": 2015,
    "shipsFrom": "Australia"
  }
]
```

</details>

## Prerequisites

You must [sign up for/create a Discogs app](https://www.discogs.com/settings/developers) to obtain the Discogs authentication variables required below. You must [create a Sendgrid account](https://sendgrid.com/pricing/) to obtain the SendGrid authentication variable required below. I went with the SendGrid free tier.

## Running locally

### Environment variables

- **DISCOGS_CONSUMER_KEY/DISCOGS_CONSUMER_SECRET** OR **DISCOGS_USER_TOKEN** (req - see [Discogs API documentation](http://www.discogs.com/developers/#page:authentication) for more info) - Auth for Discogs app
- **SENDGRID_API_KEY** (req) - Auth for SendGrid account
- **SENDER_EMAIL** (req) - Email address to send digest from via SendGrid (must be configured via SendGrid)
- **LOG_WANTLIST** (opt) - If true, user's wantlist will be logged to console
- **DEBUG** (opt) - If true, enables debug logging to console

  **All required environment variables above must be set before `yarn run dev` command. These can also be set via a .env file.**

E.g. `DISCOGS_USER_TOKEN=YOUR_USER_TOKEN SENDGRID_API_KEY=YOUR_API_KEY SENDER_EMAIL=sendgrid@youremail.com yarn run dev --path test.json`

### Event variables

Discogs Wantlist Marketplace Monitor is designed to be run on a schedule via AWS Lambda meaning the event object passed to the handler function is of ScheduledEvent type. The event object is used to pass data into the handler function - see the [MarketMonitorEvent interface](/src/interfaces.ts) for definition.

#### Example MarketMonitorEvent file/object

An example event file is included in the [test.json](./test.json) file. This should be modified as needed for testing.

```
{
  "username": "YOUR_DISCOGS_USERNAME",
  "shipsFrom": "Australia, New Zealand",
  "destinationEmail": "you@internet.com"
}
```

Once the [test.json](./test.json) file has been configured, use the following commands to install and run the monitor.

```
yarn install
yarn run dev --path test.json
```

## Testing

TBC

## Deployment/Infrastructure

Refer to the [/infrastructure](./infrastructure) directory.
