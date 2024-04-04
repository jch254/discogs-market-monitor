# [Discogs Wantlist Marketplace Monitor](https://603.nz)

![Build Status](https://codebuild.ap-southeast-2.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiUDhXeDRQQlY5UXRDRDY1RHVDSm5sK1d6TEp0UDR0QTl3QXE4V0NoZkZKZFZ6SVp3WUJBSFVtdW9iMm5CQlVzbVl5b2hHZi8zUEptZGMzdmo3b0JOcHlZPSIsIml2UGFyYW1ldGVyU3BlYyI6Inh5aTgyT0NBa2VnVmxtVFkiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=master)

Discogs Wantlist Marketplace Monitor powered by Serverless, TypeScript, Webpack and Node.js. The monitor scans the Discogs Marketplace for listings from the specified user's wantlist in the specified country and sends a digest email of all matching listings to the specified email address. It runs as an AWS Lambda function (scheduled every twelve hours). This saves manually searching through your wantlist for local listings.

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
    Example digest email (currently JSON dump)
  </summary>

```
  [{
      "artist": "Blakroc",
      "title": "Blakroc",
      "price": "A$649.99",
      "shippingPrice": "undefined undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW9gN8-2B5jB5gVtnTIZormXxBzn6ZIJfiHvf0SpqcoRd4ww-3D-3DLvk2_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BEYgORg-2Bf-2FY3bKYe9uxJIVyCp8jBIcvDw7fmq0E1eGKkSrpJZaOTKzadYfshF-2F-2F46HSGSIT2klgK2Pu4-2ByevR2F9YnJ-2FEgNF-2F3PubTzcn8-2FNY2nYurss7ydCpKZSIh-2F-2Bh35N91JWiv4U9F8K4VBgFFHw-3D-3D
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
      "shippingPrice": "80 undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2FxnMPsxpSKeCZFDcJ-2BomHe7t3lwhdZZx5O2XPiKn-2BaVw-3D-3Dd_PV_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BEXK-2FMcOSoPAbED-2BLYwtokN8PiOob4TZPmN5hRnyHjM7FXQCX4c1gc-2FflZS-2FCPYj1g2LCmy8fe539nqcddbGyE-2BW7KAn7JCfH-2BXYqbt2-2BtVXkf-2BQQzr1P4T8RNE4m7Zcb5gy15iX-2Fg4o9fk45LfHLnqA-3D-3D
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
      "shippingPrice": "45 undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2F5JXMLZKto6fmbICxfExF9yt47oNKDU1XCwT1q2bshkA-3D-3DtsSY_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BEfjjqufSiRFpymBHRlmoJraet5evrbPWSY0mgVLXLg9UTrQtPWRihWE5CtTfF7Yjb07g3OzgQFyc2Yo2W1AAyvao6SDP9zRpyTpvrx9wjA3r8i2z28D3d5Op3cQq8XIkxFY-2Fh6DSSEjKf-2BpmgFm-2F5kg-3D-3D
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
      "shippingPrice": "undefined undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2F0WWoR4f38bZIqkg04OvxslLaUIVj85eWSl1uSRi1g7Q-3D-3DPqTI_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BEaoRAeXrV0kzjSlLCgf-2BXj9DbNE5-2FpGFeLQdSm9nzpw7fk9SQWNyBvMlcdupDb2hLdCkXJXhFu9swVCNKZGRILlGorjPly6wQHeW-2FxcQLzuOEjrG3oMOYVkH7qm3cIEkDCSMRxIeeoRkXBcH24wugpg-3D-3D
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
      "shippingPrice": "40 undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2B16OLv1ONswP6Wod1IFGoZZy4V9u0gHwI21AgMRpL1YA-3D-3DRk1v_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BEe3laNSU1V3xgEKXHsHv64AizGXzdmcLszouOw7Z7MFNclflAJFMrW5N3IF4e0IQQgN8jOf2XGJwXcJcK4KBT6tnUPi22NnRx9TSDncBIvjPmQ-2F3YvX0PGKy7azhx9ijRcSQdbcS4j902TTCMeTg-2BVg-3D-3D
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
      "shippingPrice": "30 undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW95fQ-2Boo347Z2Gq-2FL-2FfY7fgHNav9vkiSYCbU7FT6UT2oQ-3D-3DKqrb_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BEwfdnyFhI5wheY3ERr0OourDPo59rPafCQIUJBDt9FzP4Js3wRvGeeOowy8DuUuX1NVB-2BchrLYfJptF26WZGY-2BDcX9wMbQVemOzs5DR6n0JC673H96S-2F6ZybyorSq8Tst2Qqklv-2B4a-2BunEbcXqnXSbg-3D-3D
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
      "shippingPrice": "40 undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2BMYg3yHkhNtD4QsU-2FhD1DhUXVi1yxqUIjIFObcjSjVbQ-3D-3Dlk6n_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BEXPDo5w3xF0fnnyqfyT6eev8qsuPUA2GKIpr3689BU0R8YL8OTBZYQPo-2BIKMIKotpA8ELQysIo7dKDim0z6tbIFI-2Bfa2iOYYMHKruegeLRIvOswSd-2BFdGdlkY9J0iJ1tpSIIZ7kUV4mqimDD3N-2BVCsA-3D-3D
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
      "shippingPrice": "undefined undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2F6npaqamQ8Z-2B97i6A1GLTUdMN2fw6wpuhUgkmQ0zhc8g-3D-3DVI5L_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BEsG1hYexsAhxPnvFNehFx1K402qXPlVuyoGI47fnPMajP6VJJftgQrvRXkphZJCb3B-2BfnsGdPH-2Fy38Tdosf3YM13I9VGM7HNdsWyGK0tDwqyT-2FUhcrmaWyu1lAqWCmU5qt5zcRYL8M16VkWP7LgFFpg-3D-3D
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
      "shippingPrice": "70 undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2F-2BJahGTzDH2v-2Bm0dwk4QIek5q4hDCy8fsaXqZ8dq7AcA-3D-3D9jQX_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BE6GXbMAODTLG3jQdddpsNBHi-2B73-2FY59f0d8qq9w7h5NaMpb-2FE0pHhZFAR273NNrCffPsFJxM1v7PPFbd6U-2FW6z7j3lLmTGWqFsnbGn8b0NtsMUFNcmR5ZAdHmCaG5HhwhOR5n7TMSotOPfYn-2BqZmbAQ-3D-3D
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
      "shippingPrice": "26 undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2B7bwAsQpark6sm7uavk5UFLrFk-2FhqH18U-2BzFJpA-2FXRdw-3D-3D0Gmj_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BET0-2BjKzpyQulStslwkmzOA3C-2F6AitjrdqJhfcZCvd3e9YWGetvsTEWJhnLCkk78qQyIobYulG8IBPA2bZSGYdwmV-2BZs8ijTiPgp-2FM-2BlLwpQ-2Bj2pn-2F5tA27NKirF6l3RpOWS9kuyGDG3HMJe3TiPSd-2FA-3D-3D
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
      "shippingPrice": "49 undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW9ITPZONt5lGCqbPOovYQ8d5J6OndH9PO1lZ9RSsrnQBw-3D-3Dq30h_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BEaoIOy-2FG7RY6jBn8fnGiwCRAs-2BdzfY0vLxaTnYmPuVTvWszH1u8RxGAqPC3Y-2BmZaQGEY0DQVx-2B3J-2FMpVXF-2FVJKQacVKl-2FMwNNAvK-2BOVBGkmrw-2BsXUmfCYPvTpzsrNa8-2Fkd518V-2BlmNcqbHn6yTFPhcw-3D-3D
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
      "shippingPrice": "45 undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW81EOaKfEYbo2KieD1Z5zoG4hT07MqjsZGtThthUECBRQ-3D-3DJpO__eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BEZl1SfdPShQ1w198eT8JOJLGzi4q1e1TohS037OsNK727VH606EvFVyw1hr37iY2s-2BV-2FgZrBmOX-2BIA515ALKoVk6TagaVnTW1hEATvbyHpwg-2FaPReRbMPiS56eEj-2Bq-2BBXvSC7CxdwJC5ylgmlPhDyQw-3D-3D
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
      "shippingPrice": "60 undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2BkXcSSg6l8v7T-2BLv87h8XE83OAYw3a2kCJ-2FWkSPlKAzQ-3D-3DXJ1J_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BEUvN5iwnHuJjP44U1EQMzET6mBpZOmeygMEZ9h5YdQ9-2BrhosgrCMICe8BJUNfe5Vthn-2Fvib-2BDWAvj3qGCq6IeX4LRjJu0NDPGtFJNaNri4HOWrhcPrDo6pHlN-2Fh6xhfSvyXtriZlPL4-2BjQknNCWzj-2Bg-3D-3D
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
      "shippingPrice": "45 undefined",
      "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW8XoXz-2FtMkrKTgAJk1lojZcjW9ah-2B9jefU186zr0AfEKQ-3D-3DjMdg_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8YPP2IcxEWBAL4slvyU2L-2BE5pk73IyBAmIt3WNy-2BffDcdS6jJroDS-2BB9dD5fkcjnHHSVysILK3soZnPHZ4-2BgPwsIjP3RJ8l7TnqTAhlEfBNnngzItURajZW-2B7BTZY59JtsPwO4Qd9T2RS6tXGyZtmaFTIPfEeXshO3RF1sf1lqNvw-3D-3D
      "condition": "Mint (M)",
      "sleeveCondition": "Mint (M)",
      "comments": "New, Factory Sealed! ----- contact for full stocklist and deals ---- Free Pickup in Brisbane",
      "posted": "2024-03-31T18:31:02-07:00",
      "description": "The Weeknd - Echoes Of Silence (2xLP, Mixtape, RE)",
      "format": "2xLP, Mixtape, RE",
      "year": 2015,
      "shipsFrom": "Australia"
  }]
```

</details>

## Prerequisites

You must [sign up for/create a Discogs app](https://www.discogs.com/settings/developers) to obtain the Discogs authentication variables required below. You must [create a Sendgrid account](https://sendgrid.com/pricing/) to obtain the SendGrid authentication variable required below. I went with the SendGrid free tier.

## Running locally

### Environment variables

- **DISCOGS_CONSUMER_KEY/DISCOGS_CONSUMER_SECRET** OR **DISCOGS_USER_TOKEN** (req - see [Discogs API documentation](http://www.discogs.com/developers/#page:authentication) for more info) - Auth for Discogs app
- **SENDGRID_API_KEY** (req) - Auth for SendGrid account
- **DISCOGS_USERNAME** (req) - Username of Discogs user (wantlist will be used from this user)
- **SHIPS_FROM** (req) - Country where Marketplace listings should ship from (e.g. Australia or United States - case insensitive). Multiple values accepted comma separated. E.g. Australia,New Zealand
- **DESTINATION_EMAIL** (req) - Destination email address to send digest
- **SENDER_EMAIL** (req) - Email address to send digest from via SendGrid (must be configured via SendGrid)
- **LOG_WANTLIST** (opt) - If true, user's wantlist will be logged to console
- **DEBUG** (opt) - If true, enables debug logging to console
  **All required environment variables above must be set before `yarn run dev` command. These can also be set via a .env file.**

E.g. `DISCOGS_USER_TOKEN=YOUR_USER_TOKEN SENDGRID_API_KEY=YOUR_API_KEY DISCOGS_USERNAME=YOUR_USERNAME SHIPS_FROM="New Zealand" DESTINATION_EMAIL=me@email.com SENDER_EMAIL=sendgrid@email.com yarn run dev`

```
yarn install
yarn run dev
```

## Testing

TBC

## Deployment/Infrastructure

Refer to the [/infrastructure](./infrastructure) directory.
