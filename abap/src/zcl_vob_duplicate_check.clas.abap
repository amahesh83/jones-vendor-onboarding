CLASS zcl_vob_duplicate_check DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS constructor IMPORTING io_store TYPE REF TO zif_vob_duplicate_store OPTIONAL.
    METHODS check IMPORTING is_query TYPE zif_vob_duplicate_store=>ty_query
      RETURNING VALUE(rt_matches) TYPE zif_vob_duplicate_store=>tt_matches.
  PRIVATE SECTION.
    DATA mo_store TYPE REF TO zif_vob_duplicate_store.
ENDCLASS.
CLASS zcl_vob_duplicate_check IMPLEMENTATION.
  METHOD constructor.
    mo_store = io_store.
    IF mo_store IS NOT BOUND.
      mo_store = NEW zcl_vob_duplicate_store( ).
    ENDIF.
  ENDMETHOD.
  METHOD check.
    DATA ls_query TYPE zif_vob_duplicate_store=>ty_query.
    ls_query = is_query.
    TRANSLATE ls_query-vat_number TO UPPER CASE.
    TRANSLATE ls_query-iban TO UPPER CASE.
    CONDENSE ls_query-vat_number NO-GAPS.
    CONDENSE ls_query-iban NO-GAPS.
    IF ls_query-vat_number IS INITIAL AND ls_query-iban IS INITIAL
       AND ( ls_query-name IS INITIAL OR ls_query-post_code IS INITIAL ).
      RETURN.
    ENDIF.
    rt_matches = mo_store->find( ls_query ).
  ENDMETHOD.
ENDCLASS.
