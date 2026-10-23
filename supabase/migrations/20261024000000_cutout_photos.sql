-- Background-removed photos keep their transparency and are stored as WebP.
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/webp']
 where id = 'submissions';
