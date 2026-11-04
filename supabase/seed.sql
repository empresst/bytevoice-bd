-- Demo clinic: Rakib Dental Care, Dhanmondi. All people and numbers are made up.
-- Clinic id is fixed so the agent can be configured with CLINIC_ID.

insert into clinics (id, name_bn, name_en, address_bn, address_en, phone_e164, info) values (
  '0b7e5c3a-1d2f-4a6b-9c8d-000000000001',
  'রাকিব ডেন্টাল কেয়ার',
  'Rakib Dental Care',
  'বাড়ি ২৭, রোড ৮/এ, ধানমন্ডি, ঢাকা ১২০৯',
  'House 27, Road 8/A, Dhanmondi, Dhaka 1209',
  '+8801700000000',
  jsonb_build_object(
    'hours_bn', 'শনিবার থেকে বৃহস্পতিবার, সকাল দশটা থেকে রাত নয়টা। শুক্রবার বন্ধ।',
    'hours_en', 'Saturday to Thursday, 10 AM to 9 PM. Closed on Friday.',
    'directions_bn', 'ধানমন্ডি ৮/এ রোডে, রবীন্দ্র সরোবর থেকে পাঁচ মিনিটের হাঁটা পথ। বিল্ডিংয়ের দোতলায়।',
    'directions_en', 'On Road 8/A, Dhanmondi, five minutes walk from Rabindra Sarobar. First floor.',
    'payment_bn', 'ক্যাশ, বিকাশ, আর কার্ড - সবই নেওয়া হয়।',
    'parking_bn', 'বিল্ডিংয়ের সামনে অল্প কিছু গাড়ি রাখার জায়গা আছে।',
    'emergency_bn', 'খুব বেশি রক্ত পড়লে, মুখ ফুলে গেলে বা জ্বর থাকলে দেরি না করে নিকটস্থ হাসপাতালের ইমার্জেন্সিতে যান।'
  )
);

insert into services (clinic_id, code, name_bn, name_en, duration_min, fee_bdt, prep_notes_bn) values
  ('0b7e5c3a-1d2f-4a6b-9c8d-000000000001', 'checkup',        'চেক-আপ ও পরামর্শ',          'Check-up & consultation',   20,  500, null),
  ('0b7e5c3a-1d2f-4a6b-9c8d-000000000001', 'scaling',        'স্কেলিং ও পলিশিং',           'Scaling & polishing',       30, 2000, null),
  ('0b7e5c3a-1d2f-4a6b-9c8d-000000000001', 'filling',        'দাঁতের ফিলিং',               'Filling',                   30, 1500, null),
  ('0b7e5c3a-1d2f-4a6b-9c8d-000000000001', 'root_canal',     'রুট ক্যানেল',                'Root canal treatment',      60, 8000, 'খেয়ে আসবেন, আর আগের কোনো এক্স-রে থাকলে সাথে আনবেন।'),
  ('0b7e5c3a-1d2f-4a6b-9c8d-000000000001', 'extraction',     'দাঁত তোলা',                  'Tooth extraction',          30, 1500, 'খালি পেটে আসবেন না। প্রেশার বা ডায়াবেটিসের ওষুধ খেলে ডাক্তারকে জানাবেন।'),
  ('0b7e5c3a-1d2f-4a6b-9c8d-000000000001', 'braces_consult', 'ব্রেস / অর্থোডন্টিক পরামর্শ',  'Braces consultation',       30, 1000, null),
  ('0b7e5c3a-1d2f-4a6b-9c8d-000000000001', 'whitening',      'দাঁত সাদা করা (হোয়াইটেনিং)',  'Teeth whitening',           60, 6000, null),
  ('0b7e5c3a-1d2f-4a6b-9c8d-000000000001', 'child_checkup',  'শিশুদের দাঁতের চেক-আপ',        'Child dental check-up',     20,  600, null);

insert into doctors (clinic_id, full_name_bn, full_name_en, title_en, specialty_bn, specialty_en) values
  ('0b7e5c3a-1d2f-4a6b-9c8d-000000000001', 'ডা. তানভীর আহমেদ', 'Dr. Tanvir Ahmed',  'BDS',
   'জেনারেল ডেন্টিস্ট্রি', 'General dentistry'),
  ('0b7e5c3a-1d2f-4a6b-9c8d-000000000001', 'ডা. ফারহানা ইসলাম', 'Dr. Farhana Islam', 'BDS, FCPS (Orthodontics)',
   'অর্থোডন্টিক্স (ব্রেস)', 'Orthodontics'),
  ('0b7e5c3a-1d2f-4a6b-9c8d-000000000001', 'ডা. নুসরাত জাহান', 'Dr. Nusrat Jahan',  'BDS, MS (Endodontics)',
   'রুট ক্যানেল ও কনজারভেটিভ ডেন্টিস্ট্রি', 'Endodontics & conservative dentistry');

-- Who offers what.
insert into doctor_services (doctor_id, service_id)
select d.id, s.id
from doctors d join services s on s.clinic_id = d.clinic_id
where (d.full_name_en = 'Dr. Tanvir Ahmed'  and s.code in ('checkup', 'scaling', 'filling', 'extraction', 'child_checkup'))
   or (d.full_name_en = 'Dr. Farhana Islam' and s.code in ('checkup', 'braces_consult', 'scaling', 'whitening', 'child_checkup'))
   or (d.full_name_en = 'Dr. Nusrat Jahan'  and s.code in ('checkup', 'filling', 'root_canal', 'whitening'));

-- Chamber hours. 0 = Sunday ... 5 = Friday (closed), 6 = Saturday.
insert into doctor_schedules (doctor_id, weekday, start_time, end_time)
select d.id, w.day, w.start_t, w.end_t
from doctors d
join (values
  ('Dr. Tanvir Ahmed',  6, time '10:00', time '13:00'),
  ('Dr. Tanvir Ahmed',  0, time '10:00', time '13:00'),
  ('Dr. Tanvir Ahmed',  1, time '10:00', time '13:00'),
  ('Dr. Tanvir Ahmed',  2, time '10:00', time '13:00'),
  ('Dr. Tanvir Ahmed',  3, time '10:00', time '13:00'),
  ('Dr. Tanvir Ahmed',  4, time '10:00', time '13:00'),
  ('Dr. Tanvir Ahmed',  0, time '17:00', time '21:00'),
  ('Dr. Tanvir Ahmed',  2, time '17:00', time '21:00'),
  ('Dr. Tanvir Ahmed',  4, time '17:00', time '21:00'),
  ('Dr. Farhana Islam', 6, time '16:00', time '21:00'),
  ('Dr. Farhana Islam', 1, time '16:00', time '21:00'),
  ('Dr. Farhana Islam', 3, time '16:00', time '21:00'),
  ('Dr. Nusrat Jahan',  6, time '10:00', time '13:00'),
  ('Dr. Nusrat Jahan',  0, time '15:00', time '20:00'),
  ('Dr. Nusrat Jahan',  2, time '15:00', time '20:00'),
  ('Dr. Nusrat Jahan',  4, time '15:00', time '20:00')
) as w(name, day, start_t, end_t) on w.name = d.full_name_en;
