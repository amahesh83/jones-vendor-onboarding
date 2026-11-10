CLASS ltc_vendor_guardrails DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS missing_reference_is_rejected FOR TESTING.
    METHODS wrong_company_is_rejected FOR TESTING.
    METHODS wrong_group_is_rejected FOR TESTING.
ENDCLASS.
CLASS ltc_vendor_guardrails IMPLEMENTATION.
  METHOD missing_reference_is_rejected.
    DATA(lo_cut) = NEW zcl_vob_vendor_service( ).
    DATA(ls_result) = lo_cut->create_vendor( '{"companyCode":"IE01","accountGroup":"YBIV"}' ).
    cl_abap_unit_assert=>assert_equals( act = ls_result-has_errors exp = abap_true ).
    cl_abap_unit_assert=>assert_initial( ls_result-vendor_number ).
  ENDMETHOD.
  METHOD wrong_company_is_rejected.
    DATA(lo_cut) = NEW zcl_vob_vendor_service( ).
    DATA(ls_result) = lo_cut->create_vendor( '{"requestId":"VOB-2099-00001","companyCode":"ZZ99","accountGroup":"YBIV"}' ).
    cl_abap_unit_assert=>assert_equals( act = ls_result-result exp = 'ERROR' ).
    cl_abap_unit_assert=>assert_initial( ls_result-vendor_number ).
  ENDMETHOD.
  METHOD wrong_group_is_rejected.
    DATA(lo_cut) = NEW zcl_vob_vendor_service( ).
    DATA(ls_result) = lo_cut->create_vendor( '{"requestId":"VOB-2099-00001","companyCode":"IE01","accountGroup":"ZZZZ"}' ).
    cl_abap_unit_assert=>assert_equals( act = ls_result-has_errors exp = abap_true ).
    cl_abap_unit_assert=>assert_initial( ls_result-vendor_number ).
  ENDMETHOD.
ENDCLASS.
