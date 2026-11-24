// Named places on Mars: major landforms (IAU Gazetteer of Planetary
// Nomenclature, planetocentric latitude, east longitude) and every
// spacecraft that has landed. `size` is the feature's extent in km and sets
// how close the camera must be before its name appears.
//
// Longitudes are east-positive in −180…180. The surface map is centred on 0°
// with east to the right, the same convention.

export const PLACES = {
  mars: [
    // ── landforms ──────────────────────────────────────────────────────────
    {
      id: 'olympus-mons', kind: 'mountain', name: 'โอลิมปัส มอนส์', en: 'Olympus Mons', lat: 18.65, lon: -133.8, size: 600,
      desc: 'ภูเขาไฟที่ใหญ่ที่สุดในระบบสุริยะ สูงราว 22 กิโลเมตร ราว 2.5 เท่าของยอดเขาเอเวอเรสต์ ฐานกว้างราว 600 กิโลเมตร',
    },
    {
      id: 'arsia-mons', kind: 'mountain', name: 'อาร์เซีย มอนส์', en: 'Arsia Mons', lat: -8.26, lon: -120.09, size: 435,
      desc: 'ภูเขาไฟลูกใต้สุดในสามลูกที่เรียงแถวบนที่ราบสูงทาร์ซิส ยอดมีแอ่งปากปล่องกว้างกว่า 100 กิโลเมตร',
    },
    {
      id: 'pavonis-mons', kind: 'mountain', name: 'พาโวนิส มอนส์', en: 'Pavonis Mons', lat: 1.48, lon: -112.96, size: 375,
      desc: 'ภูเขาไฟลูกกลางของแนวภูเขาไฟสามลูกบนที่ราบสูงทาร์ซิส ตั้งอยู่เกือบตรงเส้นศูนย์สูตร',
    },
    {
      id: 'ascraeus-mons', kind: 'mountain', name: 'แอสครีอัส มอนส์', en: 'Ascraeus Mons', lat: 11.92, lon: -104.08, size: 480,
      desc: 'ภูเขาไฟลูกเหนือสุดของแนวภูเขาไฟสามลูกบนที่ราบสูงทาร์ซิส และเป็นลูกที่สูงที่สุดในสามลูก',
    },
    {
      id: 'alba-mons', kind: 'mountain', name: 'อัลบา มอนส์', en: 'Alba Mons', lat: 40.47, lon: -109.6, size: 1000,
      desc: 'ภูเขาไฟที่มีฐานกว้างที่สุดบนดาวอังคาร แต่ลาดชันน้อยมาก สูงเพียงราว 7 กิโลเมตร',
    },
    {
      id: 'elysium-mons', kind: 'mountain', name: 'เอลิเซียม มอนส์', en: 'Elysium Mons', lat: 24.8, lon: 146.9, size: 400,
      desc: 'ภูเขาไฟใหญ่ที่สุดในเขตภูเขาไฟเอลิเซียม ซึ่งเป็นเขตภูเขาไฟใหญ่อันดับสองของดาวอังคารรองจากทาร์ซิส',
    },
    {
      id: 'valles-marineris', kind: 'canyon', name: 'หุบเขามาริเนริส', en: 'Valles Marineris', lat: -13.9, lon: -59.2, size: 4000,
      desc: 'ระบบหุบเขาที่ยาวกว่า 4,000 กิโลเมตร พอ ๆ กับความกว้างของสหรัฐอเมริกา และลึกถึงราว 7 กิโลเมตร ตั้งชื่อตามยานมาริเนอร์ 9 ซึ่งถ่ายภาพหุบเขานี้ได้เป็นลำแรก',
    },
    {
      id: 'noctis-labyrinthus', kind: 'canyon', name: 'นอกทิส ลาบิรินทัส', en: 'Noctis Labyrinthus', lat: -6.94, lon: -101.68, size: 1200,
      desc: 'เขาวงกตแห่งราตรี เครือข่ายหุบเหวที่ตัดกันไปมาทางปลายด้านตะวันตกของหุบเขามาริเนริส',
    },
    {
      id: 'hellas', kind: 'basin', name: 'แอ่งเฮลลัส', en: 'Hellas Planitia', lat: -42.4, lon: 70.5, size: 2300,
      desc: 'แอ่งจากการพุ่งชนขนาดใหญ่ กว้างราว 2,300 กิโลเมตร พื้นแอ่งเป็นจุดที่ต่ำที่สุดบนดาวอังคาร ความกดอากาศที่ก้นแอ่งจึงสูงกว่าที่อื่น',
    },
    {
      id: 'argyre', kind: 'basin', name: 'แอ่งอาร์ไจร์', en: 'Argyre Planitia', lat: -49.7, lon: -44.0, size: 1800,
      desc: 'แอ่งจากการพุ่งชนในซีกใต้ กว้างราว 1,800 กิโลเมตร ล้อมรอบด้วยเทือกเขาที่เกิดจากแรงกระแทก',
    },
    {
      id: 'utopia', kind: 'plain', name: 'ที่ราบยูโทเปีย', en: 'Utopia Planitia', lat: 49.7, lon: 118.0, size: 3300,
      desc: 'ที่ราบกว้างในซีกเหนือ เป็นแอ่งจากการพุ่งชนที่ใหญ่ที่สุดที่รู้จักบนดาวอังคาร ใต้พื้นมีชั้นน้ำแข็งหนา',
    },
    {
      id: 'acidalia', kind: 'plain', name: 'ที่ราบอะซิดาเลีย', en: 'Acidalia Planitia', lat: 49.76, lon: -20.7, size: 2300,
      desc: 'ที่ราบสีเข้มในซีกเหนือ อยู่ระหว่างเขตภูเขาไฟทาร์ซิสกับดินแดนอาระเบีย',
    },
    {
      id: 'chryse', kind: 'plain', name: 'ที่ราบไครซี', en: 'Chryse Planitia', lat: 28.4, lon: -40.3, size: 1600,
      desc: 'ที่ราบต่ำที่ร่องน้ำโบราณขนาดใหญ่หลายสายไหลลงมาบรรจบ ยานไวกิง 1 และมาร์สพาทไฟน์เดอร์ลงจอดในบริเวณนี้',
    },
    {
      id: 'amazonis', kind: 'plain', name: 'ที่ราบแอมะโซนิส', en: 'Amazonis Planitia', lat: 24.8, lon: -164.0, size: 2800,
      desc: 'ที่ราบเรียบมากทางตะวันตกของโอลิมปัส มอนส์ พื้นผิวอายุน้อยเพราะถูกลาวาและตะกอนปกคลุม',
    },
    {
      id: 'isidis', kind: 'plain', name: 'ที่ราบไอซิดิส', en: 'Isidis Planitia', lat: 12.9, lon: 87.0, size: 1200,
      desc: 'แอ่งจากการพุ่งชนที่ถูกตะกอนถมจนเป็นที่ราบ หลุมเจซีโรของยานเพอร์เซเวียแรนซ์อยู่ที่ขอบด้านตะวันตก',
    },
    {
      id: 'syrtis-major', kind: 'region', name: 'เซอร์ทิส เมเจอร์', en: 'Syrtis Major Planum', lat: 8.4, lon: 69.5, size: 1350,
      desc: 'ภูเขาไฟรูปโล่ที่ลาดต่ำมาก ผิวเป็นหินบะซอลต์สีเข้ม คริสตียาน ฮอยเกนส์วาดภาพบริเวณนี้ไว้ในปี 1659 นับเป็นรายละเอียดแรกที่มีคนเห็นบนพื้นผิวดาวเคราะห์ดวงอื่น',
    },
    {
      id: 'arabia', kind: 'region', name: 'อาระเบีย เทอร์รา', en: 'Arabia Terra', lat: 22.8, lon: 5.0, size: 4500,
      desc: 'ที่สูงเก่าแก่ขนาดใหญ่ เต็มไปด้วยหลุมอุกกาบาตที่ถูกกัดกร่อน เป็นหนึ่งในพื้นที่เก่าที่สุดของดาวอังคาร',
    },
    {
      id: 'gale', kind: 'crater', name: 'หลุมเกล', en: 'Gale', lat: -5.4, lon: 137.8, size: 154,
      desc: 'หลุมอุกกาบาตกว้าง 154 กิโลเมตร ตรงกลางมีภูเขาชาร์ปสูงราว 5.5 กิโลเมตร ซึ่งเกิดจากชั้นตะกอนทับถม รถคิวริออซิตีสำรวจที่นี่',
    },
    {
      id: 'jezero', kind: 'crater', name: 'หลุมเจซีโร', en: 'Jezero', lat: 18.38, lon: 77.58, size: 45,
      desc: 'หลุมอุกกาบาตกว้างราว 45 กิโลเมตร เคยเป็นทะเลสาบและยังเห็นดินดอนสามเหลี่ยมปากแม่น้ำโบราณ รถเพอร์เซเวียแรนซ์เก็บตัวอย่างหินที่นี่',
    },
    {
      id: 'huygens', kind: 'crater', name: 'หลุมฮอยเกนส์', en: 'Huygens', lat: -13.88, lon: 55.58, size: 470,
      desc: 'หลุมอุกกาบาตขนาดใหญ่กว้างราว 470 กิโลเมตร ตั้งชื่อตามคริสตียาน ฮอยเกนส์',
    },
    {
      id: 'schiaparelli', kind: 'crater', name: 'หลุมสเกียปาเรลลี', en: 'Schiaparelli', lat: -2.71, lon: 16.77, size: 460,
      desc: 'หลุมอุกกาบาตกว้างราว 460 กิโลเมตร ตั้งชื่อตามโจวันนี สเกียปาเรลลี ผู้ทำแผนที่ดาวอังคารในศตวรรษที่ 19',
    },
    {
      id: 'planum-boreum', kind: 'pole', name: 'แผ่นน้ำแข็งขั้วเหนือ', en: 'Planum Boreum', lat: 87.0, lon: 0, size: 1000,
      desc: 'แผ่นน้ำแข็งน้ำหนาราว 3 กิโลเมตร ฤดูหนาวจะมีน้ำแข็งแห้งหรือคาร์บอนไดออกไซด์แข็งปกคลุมเพิ่ม',
    },
    {
      id: 'planum-australe', kind: 'pole', name: 'แผ่นน้ำแข็งขั้วใต้', en: 'Planum Australe', lat: -83.9, lon: 160.0, size: 1000,
      desc: 'แผ่นน้ำแข็งขั้วใต้ ผิวบนเป็นน้ำแข็งแห้งถาวร ซ้อนอยู่บนชั้นน้ำแข็งน้ำปนฝุ่นหนาหลายกิโลเมตร',
    },

    // ── landing sites ──────────────────────────────────────────────────────
    {
      id: 'mars-3', kind: 'site', name: 'มาร์ส 3', en: 'Mars 3', lat: -45, lon: -158, date: '2 ธ.ค. 1971', agency: 'สหภาพโซเวียต',
      desc: 'ยานลำแรกที่ลงจอดบนดาวอังคารได้อย่างนุ่มนวล แต่ส่งสัญญาณกลับมาได้ไม่ถึงครึ่งนาทีก็เงียบไป',
    },
    {
      id: 'viking-1', kind: 'site', name: 'ไวกิง 1', en: 'Viking 1', lat: 22.27, lon: -47.95, date: '20 ก.ค. 1976', agency: 'NASA',
      desc: 'ยานลำแรกที่ลงจอดและทำงานบนพื้นดาวอังคารได้สำเร็จ ส่งภาพและข้อมูลอยู่นานกว่า 6 ปี',
    },
    {
      id: 'viking-2', kind: 'site', name: 'ไวกิง 2', en: 'Viking 2', lat: 47.64, lon: 134.29, date: '3 ก.ย. 1976', agency: 'NASA',
      desc: 'ลงจอดบนที่ราบยูโทเปีย ถ่ายภาพน้ำค้างแข็งบนพื้นดาวอังคารได้เป็นครั้งแรก',
    },
    {
      id: 'pathfinder', kind: 'site', name: 'มาร์สพาทไฟน์เดอร์', en: 'Mars Pathfinder · Sojourner', lat: 19.13, lon: -33.22, date: '4 ก.ค. 1997', agency: 'NASA',
      desc: 'ลงจอดด้วยถุงลมนิรภัย และปล่อยรถโซเจอร์เนอร์ รถสำรวจคันแรกที่วิ่งบนดาวอังคาร',
    },
    {
      id: 'spirit', kind: 'site', name: 'สปิริต', en: 'Spirit', lat: -14.5684, lon: 175.472, date: '4 ม.ค. 2004', agency: 'NASA',
      desc: 'รถสำรวจในหลุมกูเซฟ พบหลักฐานของน้ำร้อนในอดีต ทำงานนานกว่า 6 ปี',
    },
    {
      id: 'opportunity', kind: 'site', name: 'ออปพอร์ทูนิตี', en: 'Opportunity', lat: -1.9462, lon: -5.5266, date: '25 ม.ค. 2004', agency: 'NASA',
      desc: 'รถสำรวจบนที่ราบเมอริเดียนี วิ่งรวมกว่า 45 กิโลเมตรและทำงานเกือบ 15 ปี จนพายุฝุ่นปกคลุมแผงโซลาร์ในปี 2018',
    },
    {
      id: 'phoenix', kind: 'site', name: 'ฟีนิกซ์', en: 'Phoenix', lat: 68.22, lon: -125.75, date: '25 พ.ค. 2008', agency: 'NASA',
      desc: 'ยานลงจอดใกล้ขั้วเหนือ ขุดดินลงไปเพียงไม่กี่เซนติเมตรก็พบน้ำแข็ง',
    },
    {
      id: 'curiosity', kind: 'site', name: 'คิวริออซิตี', en: 'Curiosity', lat: -4.5895, lon: 137.4417, date: '6 ส.ค. 2012', agency: 'NASA',
      desc: 'รถสำรวจขนาดเท่ารถยนต์ในหลุมเกล กำลังไต่ภูเขาชาร์ปเพื่ออ่านประวัติของน้ำจากชั้นหิน',
    },
    {
      id: 'insight', kind: 'site', name: 'อินไซต์', en: 'InSight', lat: 4.502, lon: 135.623, date: '26 พ.ย. 2018', agency: 'NASA',
      desc: 'ยานวัดแผ่นดินไหวบนดาวอังคาร บันทึกแผ่นดินไหวได้กว่า 1,300 ครั้ง และวัดขนาดแกนกลางของดาวได้',
    },
    {
      id: 'perseverance', kind: 'site', name: 'เพอร์เซเวียแรนซ์', en: 'Perseverance · Ingenuity', lat: 18.4447, lon: 77.4508, date: '18 ก.พ. 2021', agency: 'NASA',
      desc: 'รถสำรวจที่เก็บตัวอย่างหินไว้รอส่งกลับโลก มาพร้อมเฮลิคอปเตอร์อินเจนิวิตี อากาศยานลำแรกที่บินได้บนดาวเคราะห์ดวงอื่น',
    },
    {
      id: 'zhurong', kind: 'site', name: 'จู้หรง', en: 'Zhurong · Tianwen-1', lat: 25.066, lon: 109.925, date: 'พ.ค. 2021', agency: 'จีน',
      desc: 'รถสำรวจคันแรกของจีน ลงจอดบนที่ราบยูโทเปียจากยานเทียนเวิ่น 1',
    },
  ],
};

export const PLACE_KIND_TEXT = {
  mountain: 'ภูเขาไฟ', canyon: 'หุบเขา', basin: 'แอ่งการพุ่งชน', plain: 'ที่ราบ', region: 'ภูมิภาค',
  crater: 'หลุมอุกกาบาต', pole: 'ขั้วดาว', site: 'จุดลงจอด',
};

/**
 * Unit vector to a planetocentric latitude / east longitude in a body's spin
 * frame: x through longitude 0°, y along the spin pole, z = x × y (so east is −z).
 * This matches how the surface maps are wrapped on the sphere.
 */
export function placeVector(lat, lon) {
  const f = (lat * Math.PI) / 180, l = (lon * Math.PI) / 180;
  return [Math.cos(f) * Math.cos(l), Math.sin(f), -Math.cos(f) * Math.sin(l)];
}

/** "18.65° เหนือ, 133.80° ตะวันตก" */
export function coordText(lat, lon) {
  const la = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'เหนือ' : 'ใต้'}`;
  const lo = `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'ตะวันออก' : 'ตะวันตก'}`;
  return `${la}, ${lo}`;
}
