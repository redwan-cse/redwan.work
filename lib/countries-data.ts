/**
 * Countries and Timezones Data
 * 
 * This module provides country and timezone data for the contact form.
 * Data includes country names, ISO codes, flags (emoji), phone codes, and associated timezones.
 */

export interface Country {
  name: string;
  code: string; // ISO 3166-1 alpha-2 code
  flag: string; // Emoji flag
  phoneCode: string;
  timezones: string[];
}

// Comprehensive list of countries (top ~195 countries)
export const countries: Country[] = [
  { name: "Afghanistan", code: "AF", flag: "🇦🇫", phoneCode: "+93", timezones: ["Asia/Kabul"] },
  { name: "Albania", code: "AL", flag: "🇦🇱", phoneCode: "+355", timezones: ["Europe/Tirane"] },
  { name: "Algeria", code: "DZ", flag: "🇩🇿", phoneCode: "+213", timezones: ["Africa/Algiers"] },
  { name: "Andorra", code: "AD", flag: "🇦🇩", phoneCode: "+376", timezones: ["Europe/Andorra"] },
  { name: "Angola", code: "AO", flag: "🇦🇴", phoneCode: "+244", timezones: ["Africa/Luanda"] },
  { name: "Argentina", code: "AR", flag: "🇦🇷", phoneCode: "+54", timezones: ["America/Argentina/Buenos_Aires", "America/Argentina/Cordoba", "America/Argentina/Salta"] },
  { name: "Armenia", code: "AM", flag: "🇦🇲", phoneCode: "+374", timezones: ["Asia/Yerevan"] },
  { name: "Australia", code: "AU", flag: "🇦🇺", phoneCode: "+61", timezones: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth", "Australia/Adelaide"] },
  { name: "Austria", code: "AT", flag: "🇦🇹", phoneCode: "+43", timezones: ["Europe/Vienna"] },
  { name: "Azerbaijan", code: "AZ", flag: "🇦🇿", phoneCode: "+994", timezones: ["Asia/Baku"] },
  { name: "Bahamas", code: "BS", flag: "🇧🇸", phoneCode: "+1-242", timezones: ["America/Nassau"] },
  { name: "Bahrain", code: "BH", flag: "🇧🇭", phoneCode: "+973", timezones: ["Asia/Bahrain"] },
  { name: "Bangladesh", code: "BD", flag: "🇧🇩", phoneCode: "+880", timezones: ["Asia/Dhaka"] },
  { name: "Barbados", code: "BB", flag: "🇧🇧", phoneCode: "+1-246", timezones: ["America/Barbados"] },
  { name: "Belarus", code: "BY", flag: "🇧🇾", phoneCode: "+375", timezones: ["Europe/Minsk"] },
  { name: "Belgium", code: "BE", flag: "🇧🇪", phoneCode: "+32", timezones: ["Europe/Brussels"] },
  { name: "Belize", code: "BZ", flag: "🇧🇿", phoneCode: "+501", timezones: ["America/Belize"] },
  { name: "Benin", code: "BJ", flag: "🇧🇯", phoneCode: "+229", timezones: ["Africa/Porto-Novo"] },
  { name: "Bhutan", code: "BT", flag: "🇧🇹", phoneCode: "+975", timezones: ["Asia/Thimphu"] },
  { name: "Bolivia", code: "BO", flag: "🇧🇴", phoneCode: "+591", timezones: ["America/La_Paz"] },
  { name: "Bosnia and Herzegovina", code: "BA", flag: "🇧🇦", phoneCode: "+387", timezones: ["Europe/Sarajevo"] },
  { name: "Botswana", code: "BW", flag: "🇧🇼", phoneCode: "+267", timezones: ["Africa/Gaborone"] },
  { name: "Brazil", code: "BR", flag: "🇧🇷", phoneCode: "+55", timezones: ["America/Sao_Paulo", "America/Manaus", "America/Recife", "America/Fortaleza"] },
  { name: "Brunei", code: "BN", flag: "🇧🇳", phoneCode: "+673", timezones: ["Asia/Brunei"] },
  { name: "Bulgaria", code: "BG", flag: "🇧🇬", phoneCode: "+359", timezones: ["Europe/Sofia"] },
  { name: "Burkina Faso", code: "BF", flag: "🇧🇫", phoneCode: "+226", timezones: ["Africa/Ouagadougou"] },
  { name: "Burundi", code: "BI", flag: "🇧🇮", phoneCode: "+257", timezones: ["Africa/Bujumbura"] },
  { name: "Cambodia", code: "KH", flag: "🇰🇭", phoneCode: "+855", timezones: ["Asia/Phnom_Penh"] },
  { name: "Cameroon", code: "CM", flag: "🇨🇲", phoneCode: "+237", timezones: ["Africa/Douala"] },
  { name: "Canada", code: "CA", flag: "🇨🇦", phoneCode: "+1", timezones: ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax"] },
  { name: "Cape Verde", code: "CV", flag: "🇨🇻", phoneCode: "+238", timezones: ["Atlantic/Cape_Verde"] },
  { name: "Central African Republic", code: "CF", flag: "🇨🇫", phoneCode: "+236", timezones: ["Africa/Bangui"] },
  { name: "Chad", code: "TD", flag: "🇹🇩", phoneCode: "+235", timezones: ["Africa/Ndjamena"] },
  { name: "Chile", code: "CL", flag: "🇨🇱", phoneCode: "+56", timezones: ["America/Santiago", "Pacific/Easter"] },
  { name: "China", code: "CN", flag: "🇨🇳", phoneCode: "+86", timezones: ["Asia/Shanghai", "Asia/Urumqi"] },
  { name: "Colombia", code: "CO", flag: "🇨🇴", phoneCode: "+57", timezones: ["America/Bogota"] },
  { name: "Comoros", code: "KM", flag: "🇰🇲", phoneCode: "+269", timezones: ["Indian/Comoro"] },
  { name: "Congo", code: "CG", flag: "🇨🇬", phoneCode: "+242", timezones: ["Africa/Brazzaville"] },
  { name: "Costa Rica", code: "CR", flag: "🇨🇷", phoneCode: "+506", timezones: ["America/Costa_Rica"] },
  { name: "Croatia", code: "HR", flag: "🇭🇷", phoneCode: "+385", timezones: ["Europe/Zagreb"] },
  { name: "Cuba", code: "CU", flag: "🇨🇺", phoneCode: "+53", timezones: ["America/Havana"] },
  { name: "Cyprus", code: "CY", flag: "🇨🇾", phoneCode: "+357", timezones: ["Asia/Nicosia"] },
  { name: "Czech Republic", code: "CZ", flag: "🇨🇿", phoneCode: "+420", timezones: ["Europe/Prague"] },
  { name: "Denmark", code: "DK", flag: "🇩🇰", phoneCode: "+45", timezones: ["Europe/Copenhagen"] },
  { name: "Djibouti", code: "DJ", flag: "🇩🇯", phoneCode: "+253", timezones: ["Africa/Djibouti"] },
  { name: "Dominica", code: "DM", flag: "🇩🇲", phoneCode: "+1-767", timezones: ["America/Dominica"] },
  { name: "Dominican Republic", code: "DO", flag: "🇩🇴", phoneCode: "+1-809", timezones: ["America/Santo_Domingo"] },
  { name: "Ecuador", code: "EC", flag: "🇪🇨", phoneCode: "+593", timezones: ["America/Guayaquil", "Pacific/Galapagos"] },
  { name: "Egypt", code: "EG", flag: "🇪🇬", phoneCode: "+20", timezones: ["Africa/Cairo"] },
  { name: "El Salvador", code: "SV", flag: "🇸🇻", phoneCode: "+503", timezones: ["America/El_Salvador"] },
  { name: "Equatorial Guinea", code: "GQ", flag: "🇬🇶", phoneCode: "+240", timezones: ["Africa/Malabo"] },
  { name: "Eritrea", code: "ER", flag: "🇪🇷", phoneCode: "+291", timezones: ["Africa/Asmara"] },
  { name: "Estonia", code: "EE", flag: "🇪🇪", phoneCode: "+372", timezones: ["Europe/Tallinn"] },
  { name: "Ethiopia", code: "ET", flag: "🇪🇹", phoneCode: "+251", timezones: ["Africa/Addis_Ababa"] },
  { name: "Fiji", code: "FJ", flag: "🇫🇯", phoneCode: "+679", timezones: ["Pacific/Fiji"] },
  { name: "Finland", code: "FI", flag: "🇫🇮", phoneCode: "+358", timezones: ["Europe/Helsinki"] },
  { name: "France", code: "FR", flag: "🇫🇷", phoneCode: "+33", timezones: ["Europe/Paris"] },
  { name: "Gabon", code: "GA", flag: "🇬🇦", phoneCode: "+241", timezones: ["Africa/Libreville"] },
  { name: "Gambia", code: "GM", flag: "🇬🇲", phoneCode: "+220", timezones: ["Africa/Banjul"] },
  { name: "Georgia", code: "GE", flag: "🇬🇪", phoneCode: "+995", timezones: ["Asia/Tbilisi"] },
  { name: "Germany", code: "DE", flag: "🇩🇪", phoneCode: "+49", timezones: ["Europe/Berlin"] },
  { name: "Ghana", code: "GH", flag: "🇬🇭", phoneCode: "+233", timezones: ["Africa/Accra"] },
  { name: "Greece", code: "GR", flag: "🇬🇷", phoneCode: "+30", timezones: ["Europe/Athens"] },
  { name: "Grenada", code: "GD", flag: "🇬🇩", phoneCode: "+1-473", timezones: ["America/Grenada"] },
  { name: "Guatemala", code: "GT", flag: "🇬🇹", phoneCode: "+502", timezones: ["America/Guatemala"] },
  { name: "Guinea", code: "GN", flag: "🇬🇳", phoneCode: "+224", timezones: ["Africa/Conakry"] },
  { name: "Guinea-Bissau", code: "GW", flag: "🇬🇼", phoneCode: "+245", timezones: ["Africa/Bissau"] },
  { name: "Guyana", code: "GY", flag: "🇬🇾", phoneCode: "+592", timezones: ["America/Guyana"] },
  { name: "Haiti", code: "HT", flag: "🇭🇹", phoneCode: "+509", timezones: ["America/Port-au-Prince"] },
  { name: "Honduras", code: "HN", flag: "🇭🇳", phoneCode: "+504", timezones: ["America/Tegucigalpa"] },
  { name: "Hong Kong", code: "HK", flag: "🇭🇰", phoneCode: "+852", timezones: ["Asia/Hong_Kong"] },
  { name: "Hungary", code: "HU", flag: "🇭🇺", phoneCode: "+36", timezones: ["Europe/Budapest"] },
  { name: "Iceland", code: "IS", flag: "🇮🇸", phoneCode: "+354", timezones: ["Atlantic/Reykjavik"] },
  { name: "India", code: "IN", flag: "🇮🇳", phoneCode: "+91", timezones: ["Asia/Kolkata"] },
  { name: "Indonesia", code: "ID", flag: "🇮🇩", phoneCode: "+62", timezones: ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] },
  { name: "Iran", code: "IR", flag: "🇮🇷", phoneCode: "+98", timezones: ["Asia/Tehran"] },
  { name: "Iraq", code: "IQ", flag: "🇮🇶", phoneCode: "+964", timezones: ["Asia/Baghdad"] },
  { name: "Ireland", code: "IE", flag: "🇮🇪", phoneCode: "+353", timezones: ["Europe/Dublin"] },
  { name: "Israel", code: "IL", flag: "🇮🇱", phoneCode: "+972", timezones: ["Asia/Jerusalem"] },
  { name: "Italy", code: "IT", flag: "🇮🇹", phoneCode: "+39", timezones: ["Europe/Rome"] },
  { name: "Jamaica", code: "JM", flag: "🇯🇲", phoneCode: "+1-876", timezones: ["America/Jamaica"] },
  { name: "Japan", code: "JP", flag: "🇯🇵", phoneCode: "+81", timezones: ["Asia/Tokyo"] },
  { name: "Jordan", code: "JO", flag: "🇯🇴", phoneCode: "+962", timezones: ["Asia/Amman"] },
  { name: "Kazakhstan", code: "KZ", flag: "🇰🇿", phoneCode: "+7", timezones: ["Asia/Almaty", "Asia/Aqtobe"] },
  { name: "Kenya", code: "KE", flag: "🇰🇪", phoneCode: "+254", timezones: ["Africa/Nairobi"] },
  { name: "Kiribati", code: "KI", flag: "🇰🇮", phoneCode: "+686", timezones: ["Pacific/Tarawa"] },
  { name: "Kosovo", code: "XK", flag: "🇽🇰", phoneCode: "+383", timezones: ["Europe/Belgrade"] },
  { name: "Kuwait", code: "KW", flag: "🇰🇼", phoneCode: "+965", timezones: ["Asia/Kuwait"] },
  { name: "Kyrgyzstan", code: "KG", flag: "🇰🇬", phoneCode: "+996", timezones: ["Asia/Bishkek"] },
  { name: "Laos", code: "LA", flag: "🇱🇦", phoneCode: "+856", timezones: ["Asia/Vientiane"] },
  { name: "Latvia", code: "LV", flag: "🇱🇻", phoneCode: "+371", timezones: ["Europe/Riga"] },
  { name: "Lebanon", code: "LB", flag: "🇱🇧", phoneCode: "+961", timezones: ["Asia/Beirut"] },
  { name: "Lesotho", code: "LS", flag: "🇱🇸", phoneCode: "+266", timezones: ["Africa/Maseru"] },
  { name: "Liberia", code: "LR", flag: "🇱🇷", phoneCode: "+231", timezones: ["Africa/Monrovia"] },
  { name: "Libya", code: "LY", flag: "🇱🇾", phoneCode: "+218", timezones: ["Africa/Tripoli"] },
  { name: "Liechtenstein", code: "LI", flag: "🇱🇮", phoneCode: "+423", timezones: ["Europe/Vaduz"] },
  { name: "Lithuania", code: "LT", flag: "🇱🇹", phoneCode: "+370", timezones: ["Europe/Vilnius"] },
  { name: "Luxembourg", code: "LU", flag: "🇱🇺", phoneCode: "+352", timezones: ["Europe/Luxembourg"] },
  { name: "Macau", code: "MO", flag: "🇲🇴", phoneCode: "+853", timezones: ["Asia/Macau"] },
  { name: "Madagascar", code: "MG", flag: "🇲🇬", phoneCode: "+261", timezones: ["Indian/Antananarivo"] },
  { name: "Malawi", code: "MW", flag: "🇲🇼", phoneCode: "+265", timezones: ["Africa/Blantyre"] },
  { name: "Malaysia", code: "MY", flag: "🇲🇾", phoneCode: "+60", timezones: ["Asia/Kuala_Lumpur"] },
  { name: "Maldives", code: "MV", flag: "🇲🇻", phoneCode: "+960", timezones: ["Indian/Maldives"] },
  { name: "Mali", code: "ML", flag: "🇲🇱", phoneCode: "+223", timezones: ["Africa/Bamako"] },
  { name: "Malta", code: "MT", flag: "🇲🇹", phoneCode: "+356", timezones: ["Europe/Malta"] },
  { name: "Marshall Islands", code: "MH", flag: "🇲🇭", phoneCode: "+692", timezones: ["Pacific/Majuro"] },
  { name: "Mauritania", code: "MR", flag: "🇲🇷", phoneCode: "+222", timezones: ["Africa/Nouakchott"] },
  { name: "Mauritius", code: "MU", flag: "🇲🇺", phoneCode: "+230", timezones: ["Indian/Mauritius"] },
  { name: "Mexico", code: "MX", flag: "🇲🇽", phoneCode: "+52", timezones: ["America/Mexico_City", "America/Cancun", "America/Tijuana"] },
  { name: "Micronesia", code: "FM", flag: "🇫🇲", phoneCode: "+691", timezones: ["Pacific/Pohnpei"] },
  { name: "Moldova", code: "MD", flag: "🇲🇩", phoneCode: "+373", timezones: ["Europe/Chisinau"] },
  { name: "Monaco", code: "MC", flag: "🇲🇨", phoneCode: "+377", timezones: ["Europe/Monaco"] },
  { name: "Mongolia", code: "MN", flag: "🇲🇳", phoneCode: "+976", timezones: ["Asia/Ulaanbaatar"] },
  { name: "Montenegro", code: "ME", flag: "🇲🇪", phoneCode: "+382", timezones: ["Europe/Podgorica"] },
  { name: "Morocco", code: "MA", flag: "🇲🇦", phoneCode: "+212", timezones: ["Africa/Casablanca"] },
  { name: "Mozambique", code: "MZ", flag: "🇲🇿", phoneCode: "+258", timezones: ["Africa/Maputo"] },
  { name: "Myanmar", code: "MM", flag: "🇲🇲", phoneCode: "+95", timezones: ["Asia/Yangon"] },
  { name: "Namibia", code: "NA", flag: "🇳🇦", phoneCode: "+264", timezones: ["Africa/Windhoek"] },
  { name: "Nauru", code: "NR", flag: "🇳🇷", phoneCode: "+674", timezones: ["Pacific/Nauru"] },
  { name: "Nepal", code: "NP", flag: "🇳🇵", phoneCode: "+977", timezones: ["Asia/Kathmandu"] },
  { name: "Netherlands", code: "NL", flag: "🇳🇱", phoneCode: "+31", timezones: ["Europe/Amsterdam"] },
  { name: "New Zealand", code: "NZ", flag: "🇳🇿", phoneCode: "+64", timezones: ["Pacific/Auckland", "Pacific/Chatham"] },
  { name: "Nicaragua", code: "NI", flag: "🇳🇮", phoneCode: "+505", timezones: ["America/Managua"] },
  { name: "Niger", code: "NE", flag: "🇳🇪", phoneCode: "+227", timezones: ["Africa/Niamey"] },
  { name: "Nigeria", code: "NG", flag: "🇳🇬", phoneCode: "+234", timezones: ["Africa/Lagos"] },
  { name: "North Korea", code: "KP", flag: "🇰🇵", phoneCode: "+850", timezones: ["Asia/Pyongyang"] },
  { name: "North Macedonia", code: "MK", flag: "🇲🇰", phoneCode: "+389", timezones: ["Europe/Skopje"] },
  { name: "Norway", code: "NO", flag: "🇳🇴", phoneCode: "+47", timezones: ["Europe/Oslo"] },
  { name: "Oman", code: "OM", flag: "🇴🇲", phoneCode: "+968", timezones: ["Asia/Muscat"] },
  { name: "Pakistan", code: "PK", flag: "🇵🇰", phoneCode: "+92", timezones: ["Asia/Karachi"] },
  { name: "Palau", code: "PW", flag: "🇵🇼", phoneCode: "+680", timezones: ["Pacific/Palau"] },
  { name: "Palestine", code: "PS", flag: "🇵🇸", phoneCode: "+970", timezones: ["Asia/Gaza", "Asia/Hebron"] },
  { name: "Panama", code: "PA", flag: "🇵🇦", phoneCode: "+507", timezones: ["America/Panama"] },
  { name: "Papua New Guinea", code: "PG", flag: "🇵🇬", phoneCode: "+675", timezones: ["Pacific/Port_Moresby"] },
  { name: "Paraguay", code: "PY", flag: "🇵🇾", phoneCode: "+595", timezones: ["America/Asuncion"] },
  { name: "Peru", code: "PE", flag: "🇵🇪", phoneCode: "+51", timezones: ["America/Lima"] },
  { name: "Philippines", code: "PH", flag: "🇵🇭", phoneCode: "+63", timezones: ["Asia/Manila"] },
  { name: "Poland", code: "PL", flag: "🇵🇱", phoneCode: "+48", timezones: ["Europe/Warsaw"] },
  { name: "Portugal", code: "PT", flag: "🇵🇹", phoneCode: "+351", timezones: ["Europe/Lisbon", "Atlantic/Azores"] },
  { name: "Qatar", code: "QA", flag: "🇶🇦", phoneCode: "+974", timezones: ["Asia/Qatar"] },
  { name: "Romania", code: "RO", flag: "🇷🇴", phoneCode: "+40", timezones: ["Europe/Bucharest"] },
  { name: "Russia", code: "RU", flag: "🇷🇺", phoneCode: "+7", timezones: ["Europe/Moscow", "Asia/Yekaterinburg", "Asia/Novosibirsk", "Asia/Vladivostok"] },
  { name: "Rwanda", code: "RW", flag: "🇷🇼", phoneCode: "+250", timezones: ["Africa/Kigali"] },
  { name: "Saint Kitts and Nevis", code: "KN", flag: "🇰🇳", phoneCode: "+1-869", timezones: ["America/St_Kitts"] },
  { name: "Saint Lucia", code: "LC", flag: "🇱🇨", phoneCode: "+1-758", timezones: ["America/St_Lucia"] },
  { name: "Saint Vincent and the Grenadines", code: "VC", flag: "🇻🇨", phoneCode: "+1-784", timezones: ["America/St_Vincent"] },
  { name: "Samoa", code: "WS", flag: "🇼🇸", phoneCode: "+685", timezones: ["Pacific/Apia"] },
  { name: "San Marino", code: "SM", flag: "🇸🇲", phoneCode: "+378", timezones: ["Europe/San_Marino"] },
  { name: "Sao Tome and Principe", code: "ST", flag: "🇸🇹", phoneCode: "+239", timezones: ["Africa/Sao_Tome"] },
  { name: "Saudi Arabia", code: "SA", flag: "🇸🇦", phoneCode: "+966", timezones: ["Asia/Riyadh"] },
  { name: "Senegal", code: "SN", flag: "🇸🇳", phoneCode: "+221", timezones: ["Africa/Dakar"] },
  { name: "Serbia", code: "RS", flag: "🇷🇸", phoneCode: "+381", timezones: ["Europe/Belgrade"] },
  { name: "Seychelles", code: "SC", flag: "🇸🇨", phoneCode: "+248", timezones: ["Indian/Mahe"] },
  { name: "Sierra Leone", code: "SL", flag: "🇸🇱", phoneCode: "+232", timezones: ["Africa/Freetown"] },
  { name: "Singapore", code: "SG", flag: "🇸🇬", phoneCode: "+65", timezones: ["Asia/Singapore"] },
  { name: "Slovakia", code: "SK", flag: "🇸🇰", phoneCode: "+421", timezones: ["Europe/Bratislava"] },
  { name: "Slovenia", code: "SI", flag: "🇸🇮", phoneCode: "+386", timezones: ["Europe/Ljubljana"] },
  { name: "Solomon Islands", code: "SB", flag: "🇸🇧", phoneCode: "+677", timezones: ["Pacific/Guadalcanal"] },
  { name: "Somalia", code: "SO", flag: "🇸🇴", phoneCode: "+252", timezones: ["Africa/Mogadishu"] },
  { name: "South Africa", code: "ZA", flag: "🇿🇦", phoneCode: "+27", timezones: ["Africa/Johannesburg"] },
  { name: "South Korea", code: "KR", flag: "🇰🇷", phoneCode: "+82", timezones: ["Asia/Seoul"] },
  { name: "South Sudan", code: "SS", flag: "🇸🇸", phoneCode: "+211", timezones: ["Africa/Juba"] },
  { name: "Spain", code: "ES", flag: "🇪🇸", phoneCode: "+34", timezones: ["Europe/Madrid", "Atlantic/Canary"] },
  { name: "Sri Lanka", code: "LK", flag: "🇱🇰", phoneCode: "+94", timezones: ["Asia/Colombo"] },
  { name: "Sudan", code: "SD", flag: "🇸🇩", phoneCode: "+249", timezones: ["Africa/Khartoum"] },
  { name: "Suriname", code: "SR", flag: "🇸🇷", phoneCode: "+597", timezones: ["America/Paramaribo"] },
  { name: "Sweden", code: "SE", flag: "🇸🇪", phoneCode: "+46", timezones: ["Europe/Stockholm"] },
  { name: "Switzerland", code: "CH", flag: "🇨🇭", phoneCode: "+41", timezones: ["Europe/Zurich"] },
  { name: "Syria", code: "SY", flag: "🇸🇾", phoneCode: "+963", timezones: ["Asia/Damascus"] },
  { name: "Taiwan", code: "TW", flag: "🇹🇼", phoneCode: "+886", timezones: ["Asia/Taipei"] },
  { name: "Tajikistan", code: "TJ", flag: "🇹🇯", phoneCode: "+992", timezones: ["Asia/Dushanbe"] },
  { name: "Tanzania", code: "TZ", flag: "🇹🇿", phoneCode: "+255", timezones: ["Africa/Dar_es_Salaam"] },
  { name: "Thailand", code: "TH", flag: "🇹🇭", phoneCode: "+66", timezones: ["Asia/Bangkok"] },
  { name: "Togo", code: "TG", flag: "🇹🇬", phoneCode: "+228", timezones: ["Africa/Lome"] },
  { name: "Tonga", code: "TO", flag: "🇹🇴", phoneCode: "+676", timezones: ["Pacific/Tongatapu"] },
  { name: "Trinidad and Tobago", code: "TT", flag: "🇹🇹", phoneCode: "+1-868", timezones: ["America/Port_of_Spain"] },
  { name: "Tunisia", code: "TN", flag: "🇹🇳", phoneCode: "+216", timezones: ["Africa/Tunis"] },
  { name: "Turkey", code: "TR", flag: "🇹🇷", phoneCode: "+90", timezones: ["Europe/Istanbul"] },
  { name: "Turkmenistan", code: "TM", flag: "🇹🇲", phoneCode: "+993", timezones: ["Asia/Ashgabat"] },
  { name: "Tuvalu", code: "TV", flag: "🇹🇻", phoneCode: "+688", timezones: ["Pacific/Funafuti"] },
  { name: "Uganda", code: "UG", flag: "🇺🇬", phoneCode: "+256", timezones: ["Africa/Kampala"] },
  { name: "Ukraine", code: "UA", flag: "🇺🇦", phoneCode: "+380", timezones: ["Europe/Kyiv"] },
  { name: "United Arab Emirates", code: "AE", flag: "🇦🇪", phoneCode: "+971", timezones: ["Asia/Dubai"] },
  { name: "United Kingdom", code: "GB", flag: "🇬🇧", phoneCode: "+44", timezones: ["Europe/London"] },
  { name: "United States", code: "US", flag: "🇺🇸", phoneCode: "+1", timezones: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"] },
  { name: "Uruguay", code: "UY", flag: "🇺🇾", phoneCode: "+598", timezones: ["America/Montevideo"] },
  { name: "Uzbekistan", code: "UZ", flag: "🇺🇿", phoneCode: "+998", timezones: ["Asia/Tashkent"] },
  { name: "Vanuatu", code: "VU", flag: "🇻🇺", phoneCode: "+678", timezones: ["Pacific/Efate"] },
  { name: "Vatican City", code: "VA", flag: "🇻🇦", phoneCode: "+379", timezones: ["Europe/Vatican"] },
  { name: "Venezuela", code: "VE", flag: "🇻🇪", phoneCode: "+58", timezones: ["America/Caracas"] },
  { name: "Vietnam", code: "VN", flag: "🇻🇳", phoneCode: "+84", timezones: ["Asia/Ho_Chi_Minh"] },
  { name: "Yemen", code: "YE", flag: "🇾🇪", phoneCode: "+967", timezones: ["Asia/Aden"] },
  { name: "Zambia", code: "ZM", flag: "🇿🇲", phoneCode: "+260", timezones: ["Africa/Lusaka"] },
  { name: "Zimbabwe", code: "ZW", flag: "🇿🇼", phoneCode: "+263", timezones: ["Africa/Harare"] },
];

/**
 * Get a country object by its ISO code
 */
export function getCountryByCode(code: string): Country | undefined {
  return countries.find(c => c.code === code);
}

/**
 * Get a country object by its name
 */
export function getCountryByName(name: string): Country | undefined {
  return countries.find(c => c.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get all timezones for a specific country
 */
export function getTimezonesByCountry(countryName: string): string[] {
  const country = getCountryByName(countryName);
  return country?.timezones || [];
}

/**
 * All unique timezones (fallback list)
 */
export const allTimezones = Array.from(
  new Set(
    countries.flatMap(c => c.timezones)
  )
).sort();

/**
 * Get phone code for a country
 */
export function getPhoneCodeByCountry(countryName: string): string {
  const country = getCountryByName(countryName);
  return country?.phoneCode || '';
}
