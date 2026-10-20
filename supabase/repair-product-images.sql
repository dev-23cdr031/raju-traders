-- Restore only product rows that still use the generic catalogue placeholder.
-- Safe to run repeatedly: rows already repaired, or rows with a custom image,
-- are not changed.
update public.products as product
set image = repair.image
from (
  values
    (27::bigint, '/white-pepper.jpg'),
    (28::bigint, '/black-pepper.jpg'),
    (29::bigint, '/mace.jpg'),
    (30::bigint, '/nutmeg.webp'),
    (31::bigint, '/star-anise.jpg'),
    (32::bigint, '/cassia.webp'),
    (33::bigint, '/cinnamon.jpg'),
    (34::bigint, '/cloves.webp'),
    (35::bigint, '/cardamom.webp'),
    (36::bigint, '/carom-ajwain.jpg'),
    (37::bigint, '/nigella-kalonji.jpg'),
    (38::bigint, '/mustard.webp'),
    (39::bigint, '/fenugreek.avif'),
    (40::bigint, '/fennel.webp'),
    (41::bigint, '/cumin.webp'),
    (42::bigint, '/cassia.webp'),
    (43::bigint, '/mace.jpg'),
    (44::bigint, '/dried-pumpkin-seeds.png'),
    (45::bigint, '/watermelon-seeds.jpg'),
    (46::bigint, '/mustard.webp'),
    (47::bigint, '/dried-pineapple.jpg')
) as repair(id, image)
where product.id = repair.id
  and product.image = '/nut-selection.png';
