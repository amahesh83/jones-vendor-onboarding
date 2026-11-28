CLASS lcl_store_double DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES zif_vob_duplicate_store.
    DATA received TYPE zif_vob_duplicate_store=>ty_query.
    DATA calls TYPE i.
ENDCLASS.
CLASS lcl_store_double IMPLEMENTATION.
  METHOD zif_vob_duplicate_store~find.
    received = is_query.
    calls = calls + 1.
    rt_matches = VALUE #( ( vendor_number = '0000100001' name = 'Synthetic Test Ltd'
      matched_on = VALUE #( ( `VAT` ) ) blocked = abap_true ) ).
  ENDMETHOD.
ENDCLASS.
CLASS ltc_duplicates DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS normalises_identifiers FOR TESTING.
    METHODS empty_query_skips_database FOR TESTING.
    METHODS preserves_blocking_match FOR TESTING.
ENDCLASS.
CLASS ltc_duplicates IMPLEMENTATION.
  METHOD normalises_identifiers.
    DATA(lo_store) = NEW lcl_store_double( ).
    DATA(lo_cut) = NEW zcl_vob_duplicate_check( lo_store ).
    DATA(lt_result) = lo_cut->check( VALUE #( vat_number = 'ie6388047v' iban = 'ie29 aibk 9311 5212 3456 78' ) ).
    cl_abap_unit_assert=>assert_equals( act = lo_store->received-vat_number exp = 'IE6388047V' ).
    cl_abap_unit_assert=>assert_equals( act = lo_store->received-iban exp = 'IE29AIBK93115212345678' ).
  ENDMETHOD.
  METHOD empty_query_skips_database.
    DATA(lo_store) = NEW lcl_store_double( ).
    DATA(lo_cut) = NEW zcl_vob_duplicate_check( lo_store ).
    DATA(lt_result) = lo_cut->check( VALUE #( ) ).
    cl_abap_unit_assert=>assert_initial( lt_result ).
    cl_abap_unit_assert=>assert_equals( act = lo_store->calls exp = 0 ).
  ENDMETHOD.
  METHOD preserves_blocking_match.
    DATA(lo_store) = NEW lcl_store_double( ).
    DATA(lo_cut) = NEW zcl_vob_duplicate_check( lo_store ).
    DATA(lt_result) = lo_cut->check( VALUE #( vat_number = 'IE6388047V' ) ).
    cl_abap_unit_assert=>assert_equals( act = lines( lt_result ) exp = 1 ).
    READ TABLE lt_result INTO DATA(ls_result) INDEX 1.
    cl_abap_unit_assert=>assert_equals( act = ls_result-blocked exp = abap_true ).
    cl_abap_unit_assert=>assert_equals( act = ls_result-vendor_number exp = '0000100001' ).
  ENDMETHOD.
ENDCLASS.
