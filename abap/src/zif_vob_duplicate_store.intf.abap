INTERFACE zif_vob_duplicate_store PUBLIC.
  TYPES: BEGIN OF ty_query,
           company_code TYPE bukrs,
           name TYPE string,
           post_code TYPE ad_pstcd1,
           country TYPE land1,
           vat_number TYPE stceg,
           iban TYPE iban,
         END OF ty_query,
         BEGIN OF ty_match,
           vendor_number TYPE lifnr,
           name TYPE name1_gp,
           city TYPE ort01_gp,
           matched_on TYPE string_table,
           blocked TYPE abap_bool,
         END OF ty_match,
         tt_matches TYPE STANDARD TABLE OF ty_match WITH DEFAULT KEY.
  METHODS find IMPORTING is_query TYPE ty_query RETURNING VALUE(rt_matches) TYPE tt_matches.
ENDINTERFACE.
