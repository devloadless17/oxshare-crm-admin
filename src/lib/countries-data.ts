import { countries } from 'countries-list';

export interface CountryItem {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
}

export const ALL_COUNTRIES: CountryItem[] = Object.entries(countries)
  .map(([code, c]) => {
    const rawPhone = Array.isArray(c.phone) ? c.phone[0] : c.phone;
    const dialCode = rawPhone ? `+${rawPhone}` : '';
    return {
      name: c.name,
      code: code.toUpperCase(),
      dialCode,
      flag: (c as { emoji?: string }).emoji || '🏳️',
    };
  })
  .filter((c) => c.dialCode !== '')
  .sort((a, b) => a.name.localeCompare(b.name));

export const ALL_NATIONALITIES: string[] = Array.from(
  new Set([
    'Afghan', 'Albanian', 'Algerian', 'American', 'Andorran', 'Angolan', 'Antiguan', 'Argentine',
    'Armenian', 'Australian', 'Austrian', 'Azerbaijani', 'Bahamian', 'Bahraini', 'Bangladeshi',
    'Barbadian', 'Belarusian', 'Belgian', 'Belizean', 'Beninese', 'Bhutanese', 'Bolivian', 'Bosnian',
    'Brazilian', 'British', 'Bruneian', 'Bulgarian', 'Burkinabe', 'Burmese', 'Burundian', 'Cambodian',
    'Cameroonian', 'Canadian', 'Cape Verdean', 'Central African', 'Chadian', 'Chilean', 'Chinese',
    'Colombian', 'Comoran', 'Congolese', 'Costa Rican', 'Croatian', 'Cuban', 'Cypriot', 'Czech',
    'Danish', 'Djiboutian', 'Dominican', 'Dutch', 'East Timorese', 'Ecuadorean', 'Egyptian', 'Emirati',
    'Equatorial Guinean', 'Eritrean', 'Estonian', 'Ethiopian', 'Fijian', 'Filipino', 'Finnish', 'French',
    'Gabonese', 'Gambian', 'Georgian', 'German', 'Ghanaian', 'Greek', 'Grenadian', 'Guatemalan',
    'Guinean', 'Guyanese', 'Haitian', 'Honduran', 'Hungarian', 'Icelander', 'Indian', 'Indonesian',
    'Iranian', 'Iraqi', 'Irish', 'Israeli', 'Italian', 'Ivorian', 'Jamaican', 'Japanese', 'Jordanian',
    'Kazakhstani', 'Kenyan', 'Kittitian', 'Kuwaiti', 'Kyrgyz', 'Laotian', 'Latvian', 'Lebanese',
    'Liberian', 'Libyan', 'Liechtensteiner', 'Lithuanian', 'Luxembourger', 'Macedonian', 'Malagasy',
    'Malawian', 'Malaysian', 'Maldivian', 'Malian', 'Maltese', 'Marshallese', 'Mauritanian', 'Mauritian',
    'Mexican', 'Micronesian', 'Moldovan', 'Monacan', 'Mongolian', 'Montenegrin', 'Moroccan', 'Mozambican',
    'Namibian', 'Nauruan', 'Nepalese', 'New Zealander', 'Nicaraguan', 'Nigerian', 'Nigerien', 'North Korean',
    'Norwegian', 'Omani', 'Pakistani', 'Palauans', 'Palestinian', 'Panamanian', 'Papua New Guinean',
    'Paraguayan', 'Peruvian', 'Polish', 'Portuguese', 'Qatari', 'Romanian', 'Russian', 'Rwandan',
    'Saint Lucian', 'Salvadoran', 'Samoan', 'San Marinese', 'Sao Tomean', 'Saudi', 'Senegalese', 'Serbian',
    'Seychellois', 'Sierra Leonean', 'Singaporean', 'Slovak', 'Slovenian', 'Solomon Islander', 'Somali',
    'South African', 'South Korean', 'South Sudanese', 'Spanish', 'Sri Lankan', 'Sudanese', 'Surinamer',
    'Swazi', 'Swedish', 'Swiss', 'Syrian', 'Taiwanese', 'Tajik', 'Tanzanian', 'Thai', 'Togolese',
    'Tongan', 'Trinidadian', 'Tunisian', 'Turkish', 'Turkmen', 'Tuvaluan', 'Ugandan', 'Ukrainian',
    'Uruguayan', 'Uzbek', 'Vanuatuans', 'Venezuelan', 'Vietnamese', 'Yemeni', 'Zambian', 'Zimbabwean'
  ])
).sort((a, b) => a.localeCompare(b));
