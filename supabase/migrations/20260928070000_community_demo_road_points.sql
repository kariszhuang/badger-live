-- Place illustrative hazards on nearby mapped streets instead of building footprints.
update public.community_updates as updates
set point = extensions.st_setsrid(extensions.st_makepoint(points.longitude, points.latitude), 4326)::extensions.geography
from (values
  ('6af9a344-4590-42a2-b548-767db39be002'::uuid, -89.40060262, 43.07587167), -- North Park Street by Science Hall
  ('6af9a344-4590-42a2-b548-767db39be003'::uuid, -89.40488360, 43.07425570), -- Lathrop Drive by Van Vleck Hall
  ('6af9a344-4590-42a2-b548-767db39be004'::uuid, -89.40778607, 43.07238899), -- West Johnson Street by Union South
  ('6af9a344-4590-42a2-b548-767db39be005'::uuid, -89.39992938, 43.07585739), -- Langdon Street by Memorial Union
  ('6af9a344-4590-42a2-b548-767db39be006'::uuid, -89.40735248, 43.07264933)  -- North Orchard Street by Morgridge Hall
) as points(id, longitude, latitude)
where updates.id = points.id and updates.is_demo;
