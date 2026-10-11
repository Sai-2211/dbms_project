export type PublicProperty = {
  id: string;
  survey_no: string;
  property_type: string;
  area: string;
  location: string;
  district_name: string;
  state_name: string;
  office_name: string;
  registration_date: string | null;
  registration_status: "registered";
  has_active_encumbrance: boolean;
};
export type PublicPage = {
  rows: PublicProperty[];
  total: number;
  page: number;
  limit: number;
};
export type PublicOverview = {
  total: number;
  types: { property_type: string; count: number }[];
  districts: { id: string; district_name: string; state_name: string }[];
};
