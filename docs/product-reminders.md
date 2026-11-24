# Product-view reminders

Product reminders use the same secured five-minute scheduler, quota, switches
and deployment as abandoned carts. Follow the complete
[shared deployment and testing guide](./abandoned-cart-reminders.md); do not
deploy the legacy product-only scheduler.

Only verified accounts with explicit product-marketing consent are tracked.
The unchecked registration choice covers both campaigns; Google sign-in and
existing accounts without consent are not automatically opted in. Product-only
preferences do not authorize cart reminders. Opt-outs are durable, and provider
bounces, complaints and suppression revoke marketing eligibility.

The latest relevant product activity schedules a reminder after two hours.
Adding the product to the cart or purchasing it cancels the candidate. An open
cart or recent cart reminder defers other product messages. Frequency limits
apply per customer and product. The email uses the current available offer and
actual product image, with a signed product link and unsubscribe. Missing or
unsafe images prevent sending. A provider outcome that cannot be confirmed
remains locked for review rather than risking a duplicate.

Visitor Analytics shows provider and delivery statuses, clicks and attributed
purchases. Email security scanners can count as clicks. Revenue is gross
recorded item value before discounts and may include client-supplied prices; it
is not verified net revenue or proof the reminder caused a purchase.
